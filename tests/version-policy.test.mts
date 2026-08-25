import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versionPolicyCli = join(repositoryRoot, 'scripts/version-policy.mjs');
const versionFiles = [
  'package.json',
  'compose.yml',
  'README.md',
  'TECHNICAL.md',
  'DEPLOYMENT.md',
] as const;

type VersionFile = (typeof versionFiles)[number];

const currentVersion = JSON.parse(
  await readFile(join(repositoryRoot, 'package.json'), 'utf8')
).version as string;

function incrementVersion(version: string, component: 'patch' | 'minor' | 'major'): string {
  let [major, minor, patch] = version.split('.').map(Number);

  if (component === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (component === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

function previousVersion(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number);

  if (patch > 0) return `${major}.${minor}.${patch - 1}`;
  if (minor > 0) return `${major}.${minor - 1}.0`;
  if (major > 0) return `${major - 1}.0.0`;
  return '0.0.1';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function createFixture(t: test.TestContext): Promise<string> {
  const fixture = await mkdtemp(join(tmpdir(), 'thedailyfeed-version-policy-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));

  await Promise.all(
    versionFiles.map(async (path) => {
      const source = await readFile(join(repositoryRoot, path), 'utf8');
      await writeFile(join(fixture, path), source);
    })
  );

  return fixture;
}

function runVersionPolicy(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [versionPolicyCli, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

async function snapshot(fixture: string): Promise<Record<VersionFile, string>> {
  return Object.fromEntries(
    await Promise.all(
      versionFiles.map(async (path) => [path, await readFile(join(fixture, path), 'utf8')])
    )
  ) as Record<VersionFile, string>;
}

test('the current repository has valid synchronized version metadata', () => {
  const result = runVersionPolicy(repositoryRoot, 'check');

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(`version metadata is synchronized at ${escapeRegExp(currentVersion)}`)
  );
});

test('version bumps synchronize every marker and reset lower components', async (t) => {
  const cases = [
    ['patch', incrementVersion(currentVersion, 'patch')],
    ['minor', incrementVersion(currentVersion, 'minor')],
    ['major', incrementVersion(currentVersion, 'major')],
  ] as const;

  for (const [component, expected] of cases) {
    await t.test(component, async (t) => {
      const fixture = await createFixture(t);
      const result = runVersionPolicy(fixture, 'bump', component);

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        result.stdout,
        new RegExp(
          `version bumped from ${escapeRegExp(currentVersion)} to ${escapeRegExp(expected)}`
        )
      );

      const files = await snapshot(fixture);
      assert.equal(JSON.parse(files['package.json']).version, expected);
      for (const [path, source] of Object.entries(files)) {
        assert.match(source, new RegExp(escapeRegExp(expected)), `${path} has the new version`);
        assert.doesNotMatch(
          source,
          new RegExp(escapeRegExp(currentVersion)),
          `${path} no longer has the old version`
        );
      }

      const check = runVersionPolicy(fixture, 'check');
      assert.equal(check.status, 0, check.stderr);
    });
  }
});

test('stale, missing, duplicate, and invalid markers fail closed', async (t) => {
  const cases: ReadonlyArray<{
    name: string;
    path: VersionFile;
    mutate(source: string): string;
  }> = [
    {
      name: 'stale',
      path: 'compose.yml',
      mutate: (source) => source.replace(
        `APP_VERSION=\${APP_VERSION:-${currentVersion}}`,
        `APP_VERSION=\${APP_VERSION:-${previousVersion(currentVersion)}}`
      ),
    },
    {
      name: 'missing',
      path: 'README.md',
      mutate: (source) => source.replace(
        `Current release: \`${currentVersion}\`.`,
        'Release metadata is missing.'
      ),
    },
    {
      name: 'duplicate',
      path: 'README.md',
      mutate: (source) => `${source}\nCurrent release: \`${currentVersion}\`.\n`,
    },
    {
      name: 'leading zero',
      path: 'package.json',
      mutate: (source) => source.replace(
        `"version": "${currentVersion}"`,
        `"version": "0${currentVersion}"`
      ),
    },
    {
      name: 'prerelease metadata',
      path: 'TECHNICAL.md',
      mutate: (source) => source.replace(
        `This document reflects the ${currentVersion} implementation`,
        `This document reflects the ${currentVersion}-rc.1 implementation`
      ),
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async (t) => {
      const fixture = await createFixture(t);
      const path = join(fixture, scenario.path);
      await writeFile(path, scenario.mutate(await readFile(path, 'utf8')));

      const result = runVersionPolicy(fixture, 'check');
      assert.notEqual(result.status, 0);
    });
  }
});

test('invalid bump arguments leave every target unchanged', async (t) => {
  for (const args of [['bump'], ['bump', 'banana'], ['bump', 'patch', 'extra']]) {
    await t.test(args.join(' ') || 'missing argument', async (t) => {
      const fixture = await createFixture(t);
      const before = await snapshot(fixture);
      const result = runVersionPolicy(fixture, ...args);

      assert.notEqual(result.status, 0);
      assert.deepEqual(await snapshot(fixture), before);
    });
  }
});

test('pre-existing drift prevents a bump and leaves every target unchanged', async (t) => {
  const fixture = await createFixture(t);
  const composePath = join(fixture, 'compose.yml');
  await writeFile(
    composePath,
    (await readFile(composePath, 'utf8')).replace(
      `APP_VERSION=\${APP_VERSION:-${currentVersion}}`,
      `APP_VERSION=\${APP_VERSION:-${previousVersion(currentVersion)}}`
    )
  );
  const before = await snapshot(fixture);

  const result = runVersionPolicy(fixture, 'bump', 'patch');

  assert.notEqual(result.status, 0);
  assert.deepEqual(await snapshot(fixture), before);
});
