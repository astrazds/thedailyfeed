import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { platformPolicy } from '../lib/platform-policy';
import { verifyPwaBuildContract } from '../scripts/pwa-build-contract';

function withPublicOutput(files: Record<string, string>, run: (publicDir: string) => void): void {
  const publicDir = mkdtempSync(join(tmpdir(), 'pwa-build-contract-'));

  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(publicDir, name), content);
    }

    run(publicDir);
  } finally {
    rmSync(publicDir, { recursive: true, force: true });
  }
}

test('PWA build verifier accepts a non-empty Serwist worker with the feed-set route', () => {
  withPublicOutput(
    {
      'sw.js': `const feedSetRoute = ${JSON.stringify(platformPolicy.feedSet.route)}; const imageCache = ${JSON.stringify(platformPolicy.remoteFeedImages.options.cacheName)};`,
    },
    (publicDir) => {
      const result = verifyPwaBuildContract({ publicDir });

      assert.equal(result.serviceWorkerPath, join(publicDir, 'sw.js'));
      assert.deepEqual(result.workerAssets, [join(publicDir, 'sw.js')]);
      assert.deepEqual(result.feedSetRuntimeCache, {
        route: '/api/feeds',
        handler: 'NetworkOnly',
        method: 'GET',
      });
      assert.deepEqual(result.remoteImageRuntimeCache, {
        cacheName: 'cross-origin-feed-images',
        handler: 'StaleWhileRevalidate',
        maxAgeSeconds: 86_400,
        maxEntries: 64,
        method: 'GET',
      });
    }
  );
});

test('PWA build verifier rejects a worker that omits the feed-set route', () => {
  withPublicOutput({ 'sw.js': 'self.addEventListener("fetch", () => undefined);' }, (publicDir) => {
    assert.throws(
      () => verifyPwaBuildContract({ publicDir }),
      /Emitted Serwist worker must contain the \/api\/feeds runtime route/
    );
  });
});

test('PWA build verifier rejects a worker that omits the cross-origin image cache', () => {
  withPublicOutput(
    { 'sw.js': `const feedSetRoute = ${JSON.stringify(platformPolicy.feedSet.route)};` },
    (publicDir) => {
      assert.throws(
        () => verifyPwaBuildContract({ publicDir }),
        /must contain the bounded cross-origin image cache/
      );
    }
  );
});

test('PWA build verifier rejects stale next-pwa Workbox assets', () => {
  withPublicOutput(
    {
      'sw.js': `const feedSetRoute = ${JSON.stringify(platformPolicy.feedSet.route)};`,
      'workbox-stale.js': 'define([], function() {});',
    },
    (publicDir) => {
      assert.throws(
        () => verifyPwaBuildContract({ publicDir }),
        /must not retain next-pwa Workbox runtime assets/
      );
    }
  );
});
