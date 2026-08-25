#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const markers = [
  {
    name: 'package version',
    path: 'package.json',
    pattern: /("version"\s*:\s*")([^"]*)(")/g,
  },
  {
    name: 'Compose APP_VERSION fallback',
    path: 'compose.yml',
    pattern: /(\bAPP_VERSION=\$\{APP_VERSION:-)([^}\s]+)(\})/g,
  },
  {
    name: 'README current release',
    path: 'README.md',
    pattern: /(^Current release:\s+`)([^`\r\n]+)(`\.\s*$)/gm,
  },
  {
    name: 'technical documentation header',
    path: 'TECHNICAL.md',
    pattern: /(^This document reflects the\s+)(\S+)(\s+implementation as of\b[^\r\n]*\.\s*$)/gm,
  },
  {
    name: 'deployment guide header',
    path: 'DEPLOYMENT.md',
    pattern: /(^This guide covers running The Daily Feed\s+)(\S+)(\s+in production\b[^\r\n]*\.\s*$)/gm,
  },
  {
    name: 'deployment APP_VERSION default',
    path: 'DEPLOYMENT.md',
    pattern: /(^\|\s*`APP_VERSION`\s*\|\s*`)([^`\r\n]+)(`\s*\|\s*Build\/runtime metadata in logs\.\s*\|\s*$)/gm,
  },
];

const targetPaths = [...new Set(markers.map((marker) => marker.path))];

function fail(message) {
  throw new Error(message);
}

async function readTargets(root) {
  return new Map(
    await Promise.all(
      targetPaths.map(async (path) => [path, await readFile(resolve(root, path), 'utf8')])
    )
  );
}

function inspectTargets(sources) {
  const found = [];

  for (const marker of markers) {
    const source = sources.get(marker.path);
    const matches = [...source.matchAll(marker.pattern)];
    if (matches.length !== 1) {
      fail(`${marker.path}: expected exactly one ${marker.name} marker, found ${matches.length}`);
    }

    const version = matches[0][2];
    if (!STABLE_SEMVER.test(version)) {
      fail(`${marker.path}: ${marker.name} must use stable MAJOR.MINOR.PATCH SemVer`);
    }
    found.push({ ...marker, version });
  }

  let packageData;
  try {
    packageData = JSON.parse(sources.get('package.json'));
  } catch {
    fail('package.json: invalid JSON');
  }
  if (!packageData || typeof packageData !== 'object' || Array.isArray(packageData)) {
    fail('package.json: expected a JSON object');
  }
  if (packageData.version !== found[0].version) {
    fail('package.json: parsed version does not match its version marker');
  }

  const canonicalVersion = found[0].version;
  const drift = found.filter((marker) => marker.version !== canonicalVersion);
  if (drift.length > 0) {
    fail(
      `version drift from package.json ${canonicalVersion}: ${drift
        .map((marker) => `${marker.path} ${marker.name}=${marker.version}`)
        .join(', ')}`
    );
  }

  return canonicalVersion;
}

function increment(version, component) {
  let [major, minor, patch] = version.split('.').map(BigInt);

  if (component === 'major') {
    major += 1n;
    minor = 0n;
    patch = 0n;
  } else if (component === 'minor') {
    minor += 1n;
    patch = 0n;
  } else {
    patch += 1n;
  }

  return `${major}.${minor}.${patch}`;
}

function replaceVersion(sources, nextVersion) {
  const updated = new Map(sources);

  for (const marker of markers) {
    const source = updated.get(marker.path);
    updated.set(
      marker.path,
      source.replace(marker.pattern, (_match, prefix, _version, suffix) => {
        return `${prefix}${nextVersion}${suffix}`;
      })
    );
  }

  return updated;
}

function parseCommand(args) {
  if (args.length === 1 && args[0] === 'check') {
    return { action: 'check' };
  }
  if (
    args.length === 2 &&
    args[0] === 'bump' &&
    ['patch', 'minor', 'major'].includes(args[1])
  ) {
    return { action: 'bump', component: args[1] };
  }

  fail('usage: version-policy.mjs check | bump <patch|minor|major>');
}

async function main() {
  const command = parseCommand(process.argv.slice(2));
  const root = process.cwd();
  const sources = await readTargets(root);
  const currentVersion = inspectTargets(sources);

  if (command.action === 'check') {
    console.log(`version metadata is synchronized at ${currentVersion}`);
    return;
  }

  const nextVersion = increment(currentVersion, command.component);
  const updated = replaceVersion(sources, nextVersion);

  // Validate the complete candidate tree before the first target is written.
  const validatedVersion = inspectTargets(updated);
  if (validatedVersion !== nextVersion) {
    fail(`candidate version mismatch: expected ${nextVersion}, found ${validatedVersion}`);
  }

  for (const path of targetPaths) {
    await writeFile(resolve(root, path), updated.get(path), 'utf8');
  }

  console.log(`version bumped from ${currentVersion} to ${nextVersion}`);
}

main().catch((error) => {
  console.error(`version policy failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
