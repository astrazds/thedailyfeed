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

function serviceWorkerWithFeedSetHandler(handler: 'NetworkOnly' | 'StaleWhileRevalidate'): string {
  return `
    define(["./workbox-test"], function(workbox) {
      workbox.precacheAndRoute([]);
      workbox.registerRoute(${platformPolicy.feedSet.runtimeCache.urlPattern.toString()}, new workbox.${handler}(), "GET");
    });
  `;
}

test('PWA build verifier accepts emitted service worker artifacts that preserve declared Feed set runtime cache intent', () => {
  withPublicOutput(
    {
      'sw.js': serviceWorkerWithFeedSetHandler('NetworkOnly'),
      'workbox-test.js': 'define(["exports"], function(exports) {});',
    },
    (publicDir) => {
      const result = verifyPwaBuildContract({ publicDir });

      assert.equal(result.serviceWorkerPath, join(publicDir, 'sw.js'));
      assert.deepEqual(result.workboxAssets, [join(publicDir, 'workbox-test.js')]);
      assert.equal(result.feedSetRuntimeCache.handler, platformPolicy.feedSet.runtimeCache.handler);
    }
  );
});

test('PWA build verifier rejects emitted service worker artifacts that cache the Feed set route', () => {
  withPublicOutput(
    {
      'sw.js': serviceWorkerWithFeedSetHandler('StaleWhileRevalidate'),
      'workbox-test.js': 'define(["exports"], function(exports) {});',
    },
    (publicDir) => {
      assert.throws(
        () => verifyPwaBuildContract({ publicDir }),
        /Feed set runtime cache route must use NetworkOnly/
      );
    }
  );
});
