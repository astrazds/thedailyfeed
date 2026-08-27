import test from 'node:test';
import assert from 'node:assert/strict';

import { platformPolicy } from '../lib/platform-policy.ts';

function headersFor(headers: readonly { key: string; value: string }[]): Map<string, string> {
  return new Map(headers.map((header) => [header.key, header.value]));
}

test('platform policy declares Feed set no-store and distinct route and asset header surfaces', () => {
  assert.equal(platformPolicy.feedSet.route, '/api/feeds');
  assert.equal(platformPolicy.feedSet.cacheControl, 'no-store');
  assert.equal(platformPolicy.feedSet.runtimeCache.handler, 'NetworkOnly');
  assert.equal(platformPolicy.feedSet.runtimeCache.urlPattern.test('https://thedailyfeed.test/api/feeds'), true);
  assert.equal(platformPolicy.feedSet.runtimeCache.urlPattern.test('https://thedailyfeed.test/api/feeds/validate'), false);
  assert.deepEqual(platformPolicy.remoteFeedImages, {
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'cross-origin-feed-images',
      expiration: {
        maxEntries: 64,
        maxAgeSeconds: 86_400,
      },
    },
  });

  const surfaces = new Map(platformPolicy.headerSurfaces.map((surface) => [surface.name, surface]));

  assert.deepEqual([...surfaces.keys()], [
    'baseline',
    'app-shell',
    'api',
    'service-worker',
    'manifest',
    'next-static',
    'next-static-media',
  ]);

  assert.equal(surfaces.get('api')?.source, '/api/:path*');
  assert.equal(headersFor(surfaces.get('api')?.headers ?? []).get('Cache-Control'), platformPolicy.feedSet.cacheControl);
  assert.equal(headersFor(surfaces.get('api')?.headers ?? []).has('Content-Security-Policy'), false);

  const appShellHeaders = headersFor(surfaces.get('app-shell')?.headers ?? []);
  assert.match(appShellHeaders.get('Content-Security-Policy') ?? '', /img-src 'self' data: blob: https: http:/);
  assert.match(appShellHeaders.get('Content-Security-Policy') ?? '', /media-src 'none'/);

  const serviceWorkerHeaders = headersFor(surfaces.get('service-worker')?.headers ?? []);
  assert.equal(serviceWorkerHeaders.get('Content-Type'), 'application/javascript; charset=utf-8');
  assert.equal(serviceWorkerHeaders.get('Cache-Control'), 'no-cache, no-store, must-revalidate');

  const manifestHeaders = headersFor(surfaces.get('manifest')?.headers ?? []);
  assert.equal(manifestHeaders.get('Content-Type'), 'application/manifest+json; charset=utf-8');
  assert.equal(manifestHeaders.get('Cache-Control'), 'public, max-age=3600, must-revalidate');

  assert.equal(headersFor(surfaces.get('next-static')?.headers ?? []).get('X-Content-Type-Options'), 'nosniff');
  assert.equal(headersFor(surfaces.get('next-static-media')?.headers ?? []).get('X-Content-Type-Options'), 'nosniff');
});
