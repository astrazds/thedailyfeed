#!/usr/bin/env node
/**
 * Rerunnable documentation drift inventory for The Daily Feed.
 * Compares claim-set markdown to package.json and a small set of code probes.
 * Exit 0 always; prints JSON plus a human summary. CI claim tests stay separate.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const releaseVersion = packageJson.version;

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
];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function collectVersionMentions(source) {
  const found = new Set();
  for (const match of source.matchAll(/\b1\.\d+\.\d+\b/g)) {
    found.add(match[0]);
  }
  return [...found].sort();
}

const codeProbes = {
  opmlEnabledExport: {
    file: 'lib/opml.ts',
    mustMatch: [/enabled=["']true["']|enabled=\{|enabled="/, /enabled/],
    note: 'OPML export should write enabled attributes',
  },
  editionHeader: {
    file: 'mobile/src/useReader.ts',
    mustMatch: [/editionStartedAt/],
    note: 'Reader freezes edition day via editionStartedAt',
  },
  articleNewTab: {
    file: 'mobile/src/ArticleCard.tsx',
    mustMatch: [/target=["']_blank["']|_blank/],
    note: 'Article links open in a new tab',
  },
  emptySnapshotFallbackCopy: {
    file: 'lib/feed-load-activity.ts',
    mustMatch: [/try again/i],
    note: 'Empty snapshot-fallback activity mentions try again',
  },
};

const docProbes = [
  {
    id: 'opml-enabled',
    files: ['TECHNICAL.md', 'README.md', 'mobile/README.md', 'docs/architecture-decisions.md'],
    pattern: /enabled.*(OPML|opml)|OPML.*enabled|enabled=["']true["']|preserve[sd]? enabled/i,
    expect: 'present',
    why: '1.2.11 OPML preserves enabled/disabled',
  },
  {
    id: 'edition-header-freeze',
    files: ['TECHNICAL.md', 'README.md', 'docs/architecture-decisions.md', 'VISION.md'],
    pattern: /editionStartedAt|header.*(edition|freeze|retrieval)|freeze[sd]?.*(header|date|day)|date.*retrieval start/i,
    expect: 'present',
    why: '1.2.11 freezes reader header to edition/retrieval start',
  },
  {
    id: 'new-tab-links',
    files: ['TECHNICAL.md', 'README.md', 'mobile/README.md'],
    pattern: /new tab/,
    expect: 'present',
    why: 'Article links open in a new tab',
  },
  {
    id: 'stale-pages-router',
    files: markdownFiles,
    pattern: /\bpages\/|\bcreate-react-app\b|\bCRA\b|solely Next\.js UI|Next\.js renders the reader/i,
    expect: 'absent',
    why: 'Expo is the only frontend',
  },
  {
    id: 'technical-as-of-date',
    files: ['TECHNICAL.md'],
    pattern: /as of October 14, 2026/,
    expect: 'present',
    why: '1.2.11 technical document date is 14 October 2026',
  },
  {
    id: 'ingress-rate-baseline',
    files: ['DEPLOYMENT.md'],
    pattern: /60\/second|60 requests/,
    expect: 'present',
    why: 'ingress admission baseline is 60 requests per second',
  },
];

/**
 * Files whose version markers must match package.json.
 * Migration notes and mobile/README may name older releases for historical
 * acceptance or operator device checks (for example physical iPhone on 1.2.10).
 */
const releaseMarkerFiles = new Set(['README.md', 'TECHNICAL.md', 'DEPLOYMENT.md']);

const issues = [];
const versionReport = [];

for (const file of markdownFiles) {
  let source;
  try {
    source = read(file);
  } catch {
    issues.push({ severity: 'error', id: 'missing-file', file, detail: 'claim-set file missing' });
    continue;
  }
  const versions = collectVersionMentions(source);
  const enforceRelease = releaseMarkerFiles.has(file);
  versionReport.push({ file, versions, enforceRelease });
  if (enforceRelease) {
    for (const v of versions) {
      if (v !== releaseVersion) {
        issues.push({
          severity: 'warn',
          id: 'stale-version',
          file,
          detail: `mentions ${v}; package.json is ${releaseVersion}`,
        });
      }
    }
  }
}

for (const [probeId, probe] of Object.entries(codeProbes)) {
  const source = read(probe.file);
  const ok = probe.mustMatch.every((re) => re.test(source));
  if (!ok) {
    issues.push({
      severity: 'error',
      id: `code-probe-${probeId}`,
      file: probe.file,
      detail: `code probe failed: ${probe.note}`,
    });
  }
}

for (const probe of docProbes) {
  for (const file of probe.files) {
    let source;
    try {
      source = read(file);
    } catch {
      continue;
    }
    const matched = probe.pattern.test(source);
    if (probe.expect === 'present' && !matched) {
      issues.push({
        severity: 'warn',
        id: probe.id,
        file,
        detail: `missing expected claim: ${probe.why}`,
      });
    }
    if (probe.expect === 'absent' && matched) {
      issues.push({
        severity: 'warn',
        id: probe.id,
        file,
        detail: `unexpected claim: ${probe.why}`,
      });
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  headHint: 'run with git rev-parse HEAD alongside this script',
  releaseVersion,
  markdownFiles,
  versionReport,
  issues,
  issueCount: issues.length,
};

console.log(JSON.stringify(report, null, 2));
console.error(`\ndoc-drift-inventory: ${issues.length} issue(s) against release ${releaseVersion}`);
for (const issue of issues) {
  console.error(`- [${issue.severity}] ${issue.file}: ${issue.id} — ${issue.detail}`);
}
