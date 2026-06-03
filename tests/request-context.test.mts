import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as validateFeedUrl } from '../app/api/feeds/validate/route';
import { GET as getMetrics } from '../app/api/metrics/route';
import { getRateLimitIdentity } from '../lib/api-rate-limit';
import {
  deriveRequestContext,
  MAX_REQUEST_ID_LENGTH,
  REQUEST_ID_HEADER,
} from '../lib/request-context';

test('Request ID is forwarded but client identity headers require an explicit trusted policy', () => {
  const request = new Request('https://thedailyfeed.test/api/feeds', {
    headers: {
      'x-request-id': 'forwarded-request-1',
      'x-forwarded-for': '203.0.113.10',
      'x-real-ip': '203.0.113.11',
    },
  });

  const context = deriveRequestContext(request, {
    trustedClientIdentityHeaders: [],
    generateRequestId: () => 'generated-request-id',
  });

  assert.equal(context.requestId, 'forwarded-request-1');
  assert.equal(context.clientIdentity.value, 'unknown');
  assert.equal(context.clientIdentity.source, 'untrusted');
});

test('default request context does not trust spoofable client identity headers', () => {
  const context = deriveRequestContext(
    new Request('https://thedailyfeed.test/api/feeds', {
      headers: {
        'x-forwarded-for': '203.0.113.10',
        'x-real-ip': '203.0.113.11',
      },
    })
  );

  assert.equal(context.clientIdentity.value, 'unknown');
  assert.equal(context.clientIdentity.source, 'untrusted');
});

test('Request ID is generated when no acceptable forwarded ID is present', () => {
  const generatedRequestId = 'generated-request-1';
  const context = deriveRequestContext(new Request('https://thedailyfeed.test/api/feeds'), {
    trustedClientIdentityHeaders: [],
    generateRequestId: () => generatedRequestId,
  });

  assert.equal(context.requestId, generatedRequestId);
});

test('Request ID maximum length rules reject oversized forwarded IDs', () => {
  const oversizedRequestId = 'r'.repeat(MAX_REQUEST_ID_LENGTH + 1);
  const context = deriveRequestContext(
    new Request('https://thedailyfeed.test/api/feeds', {
      headers: {
        'x-request-id': oversizedRequestId,
      },
    }),
    {
      trustedClientIdentityHeaders: [],
      generateRequestId: () => 'generated-after-oversized-id',
    }
  );

  assert.equal(context.requestId, 'generated-after-oversized-id');
});

test('trusted proxy policy derives client identity from the first forwarded address', () => {
  const context = deriveRequestContext(
    new Request('https://thedailyfeed.test/api/feeds', {
      headers: {
        'x-forwarded-for': '203.0.113.10, 198.51.100.5',
        'x-real-ip': '203.0.113.11',
      },
    }),
    {
      trustedClientIdentityHeaders: ['x-forwarded-for', 'x-real-ip'],
      generateRequestId: () => 'generated-request-2',
    }
  );

  assert.equal(context.clientIdentity.value, '203.0.113.10');
  assert.equal(context.clientIdentity.source, 'trusted-header');
  assert.equal(context.clientIdentity.headerName, 'x-forwarded-for');
  assert.equal(getRateLimitIdentity(context), '203.0.113.10');
});

test('validation adapter preserves forwarded Request ID on error responses', async () => {
  const response = await validateFeedUrl(
    new Request('https://thedailyfeed.test/api/feeds/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': 'validate-request-1',
        'x-real-ip': 'validate-request-context',
      },
      body: '{',
    })
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers.get(REQUEST_ID_HEADER), 'validate-request-1');
});

test('metrics adapter emits a Request ID header without changing metrics access mode', async () => {
  const response = await getMetrics(
    new Request('https://thedailyfeed.test/api/metrics', {
      headers: {
        'x-correlation-id': 'metrics-request-1',
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get(REQUEST_ID_HEADER), 'metrics-request-1');
});
