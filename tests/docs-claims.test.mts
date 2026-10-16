import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const markdownFiles = [
  'README.md',
  'TECHNICAL.md',
  'DEPLOYMENT.md',
  'VISION.md',
  'CONTRIBUTING.md',
  'AGENTS.md',
  'SECURITY.md',
  'PRIVACY.md',
  'docs/architecture-decisions.md',
  'docs/migrations/expo-web.md',
  'docs/migrations/expo-web-acceptance.md',
  'mobile/README.md',
  'public/fonts/README.md',
] as const;

const markdownLinkPattern =
  /(?:!\[[^\]]*]\(|\[[^\]]*]\()([^)\s]+)(?:\s+"[^"]*")?\)/g;
const htmlLinkPattern = /\b(?:href|src)="([^"]+)"/g;
const miseRunPattern = /mise run ([a-z0-9-]+)/g;
const nginxRatePattern = /\brate=(\d+)r\/s\b/;
const nginxBurstPattern = /\bburst=(\d+)\b/;
const nginxBodySizePattern = /\bclient_max_body_size\s+(\d+)m\b/;
const deploymentRatePattern = /\b(\d+)\/second\b/;
const deploymentBurstPattern = /\bburst of (\d+)\b/;
const deploymentBodySizePattern = /\blimits request bodies\n?to (\d+) MiB\b/;
const traefikAveragePattern = /ratelimit\.average=(\d+)\b/;
const traefikBurstPattern = /ratelimit\.burst=(\d+)\b/;
const traefikBodyPattern = /buffering\.maxRequestBodyBytes=(\d+)\b/;

const ingressAdmissionBaseline = {
  ratePerSecond: '60',
  burst: '120',
  maxBodyBytes: '1048576',
  maxBodyMegabytes: '1',
} as const;
const miseTaskPattern = /^\[tasks\.([a-z0-9-]+)\]$/gm;

function isExternalTarget(target: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);
}

function githubHeadingId(heading: string): string {
  return heading
    .replace(/`/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function extractMatches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function captures(source: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...source.matchAll(new RegExp(pattern.source, flags))].map((match) => match[1]);
}

function assertCaptured(source: string, pattern: RegExp, expected: string): void {
  assert.deepEqual([...new Set(captures(source, pattern))], [expected]);
}

function headingIds(source: string): Set<string> {
  const counts = new Map<string, number>();
  const ids = new Set<string>();

  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    const base = githubHeadingId(match[1]);
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    ids.add(seen === 0 ? base : `${base}-${seen}`);
  }

  return ids;
}

test('published ingress examples share one admission baseline', async () => {
  const [nginx, deployment, traefik] = await Promise.all([
    readFile(join(repositoryRoot, 'deploy/nginx.conf'), 'utf8'),
    readFile(join(repositoryRoot, 'DEPLOYMENT.md'), 'utf8'),
    readFile(join(repositoryRoot, 'deploy/traefik-labels.example.yml'), 'utf8'),
  ]);

  assertCaptured(nginx, nginxRatePattern, ingressAdmissionBaseline.ratePerSecond);
  assertCaptured(deployment, deploymentRatePattern, ingressAdmissionBaseline.ratePerSecond);
  assertCaptured(traefik, traefikAveragePattern, ingressAdmissionBaseline.ratePerSecond);
  assertCaptured(nginx, nginxBurstPattern, ingressAdmissionBaseline.burst);
  assertCaptured(deployment, deploymentBurstPattern, ingressAdmissionBaseline.burst);
  assertCaptured(traefik, traefikBurstPattern, ingressAdmissionBaseline.burst);
  assertCaptured(nginx, nginxBodySizePattern, ingressAdmissionBaseline.maxBodyMegabytes);
  assertCaptured(deployment, deploymentBodySizePattern, ingressAdmissionBaseline.maxBodyMegabytes);
  assertCaptured(traefik, traefikBodyPattern, ingressAdmissionBaseline.maxBodyBytes);
  assert.match(traefik, /ratelimit\.period=1s\b/);
});

test('documented mise run tasks exist in mise.toml', async () => {
  const mise = await readFile(join(repositoryRoot, 'mise.toml'), 'utf8');
  const tasks = new Set(extractMatches(mise, miseTaskPattern));

  const missing: string[] = [];
  for (const file of markdownFiles) {
    const source = await readFile(join(repositoryRoot, file), 'utf8');
    for (const task of extractMatches(source, miseRunPattern)) {
      if (!tasks.has(task)) {
        missing.push(`${file}: mise run ${task}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

test('relative documentation links resolve to files and headings', async () => {
  const sources = new Map(await Promise.all(
    markdownFiles.map(async (file) => {
      const path = join(repositoryRoot, file);
      return [path, await readFile(path, 'utf8')] as const;
    })
  ));
  const headings = new Map(
    [...sources].map(([file, source]) => [file, headingIds(source)])
  );

  const missing: string[] = [];

  for (const [file, source] of sources) {
    const targets = [
      ...extractMatches(source, markdownLinkPattern),
      ...extractMatches(source, htmlLinkPattern),
    ];

    for (const target of targets) {
      if (isExternalTarget(target)) {
        continue;
      }

      const [pathPart, hash] = target.split('#', 2);
      const resolved = pathPart
        ? resolve(dirname(file), pathPart)
        : file;

      if (!pathPart) {
        if (hash && !headings.get(file)?.has(hash)) {
          missing.push(`${relative(repositoryRoot, file)} -> #${hash}`);
        }
        continue;
      }

      const linkedSource = sources.get(resolved);
      if (linkedSource === undefined) {
        try {
          await readFile(resolved);
        } catch {
          missing.push(`${relative(repositoryRoot, file)} -> ${target}`);
          continue;
        }
      }

      if (hash) {
        const ids = headings.get(resolved) ?? headingIds(await readFile(resolved, 'utf8'));
        if (!ids.has(hash)) {
          missing.push(`${relative(repositoryRoot, file)} -> ${target}`);
        }
      }
    }
  }

  assert.deepEqual(missing, []);
});

test('documentation drift inventory reports no open issues', () => {
  const script = join(repositoryRoot, 'scripts', 'doc-drift-inventory.mjs');
  const result = spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  const packageVersion = JSON.parse(
    readFileSync(join(repositoryRoot, 'package.json'), 'utf8')
  ).version;
  assert.equal(report.releaseVersion, packageVersion);
  assert.deepEqual(report.issues, []);
});
