import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as postFeeds } from '../app/api/feeds/route';
import { POST as validateFeed } from '../app/api/feeds/validate/route';
import { RATE_LIMIT_MAX_REQUESTS } from '../lib/constants';
import { REQUEST_ID_HEADER } from '../lib/request-context';
import { clearRateLimitState } from '../lib/rate-limiter';

type RouteHandler = (request: Request) => Promise<Response>;

interface RouteCase {
  handler: RouteHandler;
  name: string;
  url: string;
}

const routeCases: RouteCase[] = [
  {
    handler: postFeeds,
    name: 'Feed fetch route',
    url: 'https://thedailyfeed.test/api/feeds',
  },
  {
    handler: validateFeed,
    name: 'Feed validation route',
    url: 'https://thedailyfeed.test/api/feeds/validate',
  },
];

function setProcessEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }

  Reflect.set(process.env, name, value);
}

async function withNodeEnv<T>(value: string | undefined, callback: () => Promise<T>): Promise<T> {
  const original = process.env.NODE_ENV;
  setProcessEnv('NODE_ENV', value);

  try {
    return await callback();
  } finally {
    setProcessEnv('NODE_ENV', original);
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

async function exhaustRouteRateLimit(route: RouteCase, identity: string): Promise<Response> {
  let response: Response | undefined;

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
    response = await route.handler(
      new Request(route.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-real-ip': identity,
          'x-request-id': `${identity}-${attempt}`,
        },
        body: '{',
      })
    );
  }

  assert.ok(response);
  return response;
}

for (const route of routeCases) {
  test(`${route.name} uses shared admission rate-limit response`, async () => {
    clearRateLimitState();
    const identity = `route-admission-${route.name.replaceAll(' ', '-').toLowerCase()}-${Date.now()}`;
    const response = await exhaustRouteRateLimit(route, identity);
    const payload = requireRecord(await response.json());

    assert.equal(response.status, 429);
    assert.equal(response.headers.get(REQUEST_ID_HEADER), `${identity}-${RATE_LIMIT_MAX_REQUESTS}`);
    assert.equal(response.headers.get('X-RateLimit-Limit'), String(RATE_LIMIT_MAX_REQUESTS));
    assert.equal(response.headers.get('X-RateLimit-Remaining'), '0');
    assert.equal(response.headers.get('Retry-After'), String(payload.retryAfter));
    assert.equal(payload.error, 'Too many requests. Please try again later.');
    assert.equal(typeof payload.retryAfter, 'number');
  });

  test(`${route.name} leaves production ingress rate limiting to the reverse proxy`, async () => {
    await withNodeEnv('production', async () => {
      clearRateLimitState();
      let response: Response | undefined;

      for (let attempt = 0; attempt <= RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
        response = await route.handler(
          new Request(route.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-real-ip': 'proxy-owned-ingress-test',
              'x-request-id': `proxy-owned-ingress-test-${attempt}`,
            },
            body: '{',
          })
        );
      }

      assert.ok(response);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('X-RateLimit-Limit'), null);
      assert.equal(response.headers.get('X-RateLimit-Remaining'), null);
    });
  });
}
