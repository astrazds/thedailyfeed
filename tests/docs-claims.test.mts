import test from 'node:test';
import assert from 'node:assert/strict';
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
  'public/fonts/README.md',
] as const;

const markdownLinkPattern =
  /(?:!\[[^\]]*]\(|\[[^\]]*]\()([^)\s]+)(?:\s+"[^"]*")?\)/g;
const htmlLinkPattern = /\b(?:href|src)="([^"]+)"/g;
const miseRunPattern = /mise run ([a-z0-9-]+)/g;
const nginxBurstPattern = /\bburst=(\d+)\b/;
const nginxBodySizePattern = /\bclient_max_body_size\s+(\d+)m\b/;
const deploymentBurstPattern = /\bburst of (\d+)\b/;
const deploymentBodySizePattern = /\blimits request bodies\n?to (\d+) MiB\b/;
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

test('DEPLOYMENT.md matches the Nginx example burst and body limit', async () => {
  const [nginx, deployment] = await Promise.all([
    readFile(join(repositoryRoot, 'deploy/nginx.conf'), 'utf8'),
    readFile(join(repositoryRoot, 'DEPLOYMENT.md'), 'utf8'),
  ]);

  assert.match(nginx, nginxBurstPattern);
  assert.match(nginx, nginxBodySizePattern);
  const burst = nginxBurstPattern.exec(nginx)?.[1];
  const bodyMegabytes = nginxBodySizePattern.exec(nginx)?.[1];
  assert.equal(deploymentBurstPattern.exec(deployment)?.[1], burst);
  assert.equal(deploymentBodySizePattern.exec(deployment)?.[1], bodyMegabytes);
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
