import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { verifyPwaBuildContract } from './pwa-build-contract';

function runCli(): void {
  const result = verifyPwaBuildContract();
  const entries = JSON.parse(readFileSync('.expo-precache.json', 'utf8')) as { url: string; revision: string }[];
  const worker = readFileSync(result.serviceWorkerPath, 'utf8');
  const document = readFileSync('public/expo/index.html', 'utf8');
  assert.match(document, /<div id="root"><\/div>/);
  assert.match(document, /src="\/_expo\/static\/js\/web\//);
  assert.doesNotMatch(document, /_next\/static/);
  assert(entries.some((entry) => entry.url === '/'), 'Expo root must be precached');
  assert(entries.some((entry) => entry.url === '/manifest.webmanifest'), 'Install manifest must be precached');
  for (const entry of entries) {
    assert(worker.includes(entry.url) && worker.includes(entry.revision), `Worker is missing revisioned Expo asset ${entry.url}`);
    if (entry.url === '/manifest.webmanifest') continue;
    const file = entry.url === '/' ? 'public/expo/index.html' : `public${entry.url}`;
    assert(existsSync(file) || existsSync(`public/expo${entry.url}`), `Export asset is missing ${entry.url}`);
  }

  console.log(
    `PWA build artifacts verified: sw.js, ${result.feedSetRuntimeCache.route} ${result.feedSetRuntimeCache.method} ${result.feedSetRuntimeCache.handler}, and bounded ${result.remoteImageRuntimeCache.handler} cross-origin image runtime routes`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
