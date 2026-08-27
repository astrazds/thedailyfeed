import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { platformPolicy, type PlatformPolicy } from '../lib/platform-policy';
import { buildSerwistRuntimeCaching } from '../lib/serwist-runtime-caching';

export type PwaBuildContractResult = {
  readonly serviceWorkerPath: string;
  readonly workerAssets: readonly string[];
  readonly feedSetRuntimeCache: {
    readonly route: string;
    readonly handler: string;
    readonly method: string;
  };
};

type PwaBuildContractOptions = {
  readonly publicDir?: string;
  readonly policy?: PlatformPolicy;
};

type RecordedStrategy = {
  readonly name: 'CacheFirst' | 'NetworkOnly' | 'StaleWhileRevalidate';
  readonly options?: unknown;
};

function assertNonEmptyFile(path: string): void {
  assert.ok(existsSync(path), `${path} must exist`);
  assert.ok(statSync(path).size > 0, `${path} must not be empty`);
}

function assertNoLegacyWorkboxAssets(publicDir: string): void {
  const legacyAssets = readdirSync(publicDir).filter((name) => /^workbox-.*\.js(?:\.map)?$/.test(name));
  assert.deepEqual(legacyAssets, [], 'PWA build must not retain next-pwa Workbox runtime assets');
}

function assertFeedSetRuntimeCache(
  policy: PlatformPolicy
): PwaBuildContractResult['feedSetRuntimeCache'] {
  const runtimeCaching = buildSerwistRuntimeCaching<RecordedStrategy>(
    {
      cacheFirst: (options) => ({ name: 'CacheFirst', options }),
      networkOnly: () => ({ name: 'NetworkOnly' }),
      staleWhileRevalidate: (options) => ({ name: 'StaleWhileRevalidate', options }),
    },
    policy
  );
  const feedSetUrl = new URL(policy.feedSet.route, 'https://thedailyfeed.test');
  const validationUrl = new URL(`${policy.feedSet.route}/validate`, 'https://thedailyfeed.test');
  const matchingRoutes = runtimeCaching.filter((route) =>
    route.matcher({ sameOrigin: true, url: feedSetUrl })
  );

  assert.equal(policy.feedSet.cacheControl, 'no-store');
  assert.equal(matchingRoutes.length, 1, 'Serwist must register exactly one feed-set runtime route');

  const [feedSetRoute] = matchingRoutes;
  assert.equal(feedSetRoute.method, 'GET');
  assert.deepEqual(feedSetRoute.handler, { name: 'NetworkOnly' });
  assert.equal(
    feedSetRoute.matcher({ sameOrigin: true, url: validationUrl }),
    false,
    'Feed-set runtime route must not match feed validation'
  );

  return {
    route: policy.feedSet.route,
    handler: feedSetRoute.handler.name,
    method: feedSetRoute.method,
  };
}

export function verifyPwaBuildContract(options: PwaBuildContractOptions = {}): PwaBuildContractResult {
  const publicDir = resolve(options.publicDir ?? 'public');
  const policy = options.policy ?? platformPolicy;
  const serviceWorkerPath = resolve(publicDir, 'sw.js');

  assertNonEmptyFile(serviceWorkerPath);
  assertNoLegacyWorkboxAssets(publicDir);

  const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
  assert.ok(
    serviceWorker.includes(policy.feedSet.route),
    `Emitted Serwist worker must contain the ${policy.feedSet.route} runtime route`
  );

  return {
    serviceWorkerPath,
    workerAssets: [serviceWorkerPath],
    feedSetRuntimeCache: assertFeedSetRuntimeCache(policy),
  };
}
