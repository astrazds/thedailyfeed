import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as getMetrics } from '../app/api/metrics/route';
import { REQUEST_ID_HEADER } from '../lib/request-context';

interface MetricsExposurePolicyResponse {
  metricsExposure: {
    mode: string;
    access: string;
    cacheControl: string;
    requestId: string;
    realm: string;
  };
  feedApi: unknown;
  feedCache: unknown;
}

function setProcessEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }

  Reflect.set(process.env, name, value);
}

async function withEnv<T>(
  env: { NODE_ENV?: string; METRICS_AUTH_TOKEN?: string },
  callback: () => Promise<T>
): Promise<T> {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMetricsAuthToken = process.env.METRICS_AUTH_TOKEN;

  setProcessEnv('NODE_ENV', env.NODE_ENV);
  setProcessEnv('METRICS_AUTH_TOKEN', env.METRICS_AUTH_TOKEN);

  try {
    return await callback();
  } finally {
    setProcessEnv('NODE_ENV', originalNodeEnv);
    setProcessEnv('METRICS_AUTH_TOKEN', originalMetricsAuthToken);
  }
}

test('metrics endpoint exposes the named operator policy with conservative caching and Request ID correlation', async () => {
  const response = await getMetrics(
    new Request('https://thedailyfeed.test/api/metrics', {
      headers: {
        'x-request-id': 'metrics-policy-request-1',
      },
    })
  );

  const body = (await response.json()) as MetricsExposurePolicyResponse;

  assert.equal(response.status, 200);
  assert.equal(response.headers.get(REQUEST_ID_HEADER), 'metrics-policy-request-1');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(body.metricsExposure, {
    mode: 'app-authenticated-operator',
    access: 'bearer-token-required-in-production',
    cacheControl: 'no-store',
    requestId: 'forwarded-or-generated',
    realm: 'thedailyfeed-metrics',
  });
  assert.equal(typeof body.feedApi, 'object');
  assert.equal(typeof body.feedCache, 'object');
});

test('metrics endpoint is hidden in production without an app auth token', async () => {
  await withEnv({ NODE_ENV: 'production' }, async () => {
    const response = await getMetrics(
      new Request('https://thedailyfeed.test/api/metrics', {
        headers: {
          'x-request-id': 'metrics-hidden-request-1',
        },
      })
    );

    assert.equal(response.status, 404);
    assert.equal(response.headers.get(REQUEST_ID_HEADER), 'metrics-hidden-request-1');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });
});

test('metrics endpoint requires bearer authorization when a token is configured', async () => {
  await withEnv({ NODE_ENV: 'production', METRICS_AUTH_TOKEN: 'metrics-secret' }, async () => {
    const deniedResponse = await getMetrics(
      new Request('https://thedailyfeed.test/api/metrics', {
        headers: {
          authorization: 'Bearer wrong-secret',
          'x-request-id': 'metrics-denied-request-1',
        },
      })
    );

    assert.equal(deniedResponse.status, 401);
    assert.equal(deniedResponse.headers.get(REQUEST_ID_HEADER), 'metrics-denied-request-1');
    assert.equal(deniedResponse.headers.get('WWW-Authenticate'), 'Bearer realm="thedailyfeed-metrics"');

    const allowedResponse = await getMetrics(
      new Request('https://thedailyfeed.test/api/metrics', {
        headers: {
          authorization: 'Bearer metrics-secret',
          'x-request-id': 'metrics-allowed-request-1',
        },
      })
    );

    assert.equal(allowedResponse.status, 200);
    assert.equal(allowedResponse.headers.get(REQUEST_ID_HEADER), 'metrics-allowed-request-1');
  });
});
