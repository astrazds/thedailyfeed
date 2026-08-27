import test from 'node:test';
import assert from 'node:assert/strict';

import { platformPolicy } from '../lib/platform-policy';
import { buildSerwistRuntimeCaching } from '../lib/serwist-runtime-caching';

type RecordedStrategy = {
  readonly name: string;
  readonly options?: unknown;
};

const strategyFactory = {
  networkOnly: (): RecordedStrategy => ({ name: 'NetworkOnly' }),
  staleWhileRevalidate: (options: unknown): RecordedStrategy => ({
    name: 'StaleWhileRevalidate',
    options,
  }),
};

function matchContext(url: string, destination: RequestDestination = '') {
  const parsedUrl = new URL(url);
  return {
    sameOrigin: parsedUrl.origin === 'https://thedailyfeed.test',
    url: parsedUrl,
    request: { destination },
  };
}

test('Serwist adapter registers the exact feed-set route first as GET-only NetworkOnly', () => {
  const runtimeCaching = buildSerwistRuntimeCaching(strategyFactory);
  const [feedSetRoute] = runtimeCaching;
  const feedSetUrl = new URL('https://thedailyfeed.test/api/feeds');
  const validationUrl = new URL('https://thedailyfeed.test/api/feeds/validate');

  assert.equal(feedSetRoute.matcher(matchContext(feedSetUrl.href)), true);
  assert.equal(feedSetRoute.matcher(matchContext(validationUrl.href)), false);
  assert.equal(
    feedSetRoute.matcher(matchContext('https://feeds.example/api/feeds')),
    false
  );
  assert.equal(feedSetRoute.method, 'GET');
  assert.deepEqual(feedSetRoute.handler, { name: 'NetworkOnly' });

  const matchingRoutes = runtimeCaching.filter((entry) =>
    entry.matcher(matchContext(feedSetUrl.href))
  );
  assert.equal(matchingRoutes.length, 1);
  assert.equal(runtimeCaching.length, 2);
  assert.equal(platformPolicy.feedSet.cacheControl, 'no-store');
});

test('Serwist caches only cross-origin image requests outside the feed API', () => {
  const [, imageRoute] = buildSerwistRuntimeCaching(strategyFactory);

  assert.equal(
    imageRoute.matcher(matchContext('https://media.example/extensionless?id=1', 'image')),
    true
  );
  assert.equal(
    imageRoute.matcher(matchContext('https://media.example/render?format=webp', 'image')),
    true
  );
  assert.equal(
    imageRoute.matcher(matchContext('https://media.example/app.js', 'script')),
    false
  );
  assert.equal(
    imageRoute.matcher(matchContext('https://thedailyfeed.test/local.png', 'image')),
    false
  );
  assert.equal(
    imageRoute.matcher(matchContext('https://thedailyfeed.test/api/feeds/validate', 'image')),
    false
  );
  assert.equal(
    imageRoute.matcher(matchContext('https://thedailyfeed.test/api/other', '')),
    false
  );
  assert.equal(imageRoute.method, 'GET');
  assert.deepEqual(imageRoute.handler, {
    name: 'StaleWhileRevalidate',
    options: {
      cacheName: 'cross-origin-feed-images',
      expiration: {
        maxEntries: 64,
        maxAgeSeconds: 86_400,
      },
    },
  });
});
