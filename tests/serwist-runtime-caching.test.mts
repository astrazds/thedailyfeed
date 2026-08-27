import test from 'node:test';
import assert from 'node:assert/strict';

import { platformPolicy } from '../lib/platform-policy';
import { buildSerwistRuntimeCaching } from '../lib/serwist-runtime-caching';

type RecordedStrategy = {
  readonly name: string;
  readonly options?: unknown;
};

const strategyFactory = {
  cacheFirst: (options: unknown): RecordedStrategy => ({ name: 'CacheFirst', options }),
  networkOnly: (): RecordedStrategy => ({ name: 'NetworkOnly' }),
  staleWhileRevalidate: (options: unknown): RecordedStrategy => ({
    name: 'StaleWhileRevalidate',
    options,
  }),
};

test('Serwist adapter registers the exact feed-set route first as GET-only NetworkOnly', () => {
  const runtimeCaching = buildSerwistRuntimeCaching(strategyFactory);
  const [feedSetRoute] = runtimeCaching;
  const feedSetUrl = new URL('https://thedailyfeed.test/api/feeds');
  const validationUrl = new URL('https://thedailyfeed.test/api/feeds/validate');

  assert.equal(feedSetRoute.matcher({ sameOrigin: true, url: feedSetUrl }), true);
  assert.equal(feedSetRoute.matcher({ sameOrigin: true, url: validationUrl }), false);
  assert.equal(feedSetRoute.matcher({ sameOrigin: false, url: feedSetUrl }), false);
  assert.equal(feedSetRoute.method, 'GET');
  assert.deepEqual(feedSetRoute.handler, { name: 'NetworkOnly' });

  const matchingRoutes = runtimeCaching.filter((entry) =>
    entry.matcher({ sameOrigin: true, url: feedSetUrl })
  );
  assert.equal(matchingRoutes.length, 1);
  assert.equal(platformPolicy.feedSet.cacheControl, 'no-store');
});
