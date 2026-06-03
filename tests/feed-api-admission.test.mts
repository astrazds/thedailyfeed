import test from 'node:test';
import assert from 'node:assert/strict';
import type { ApiRateLimitResult } from '../lib/api-rate-limit';
import { admitFeedRouteRequest } from '../lib/feed-api-admission';
import {
  MAX_REQUEST_ID_LENGTH,
  REQUEST_ID_HEADER,
  type RequestContext,
} from '../lib/request-context';

const allowedRateLimit: ApiRateLimitResult = {
  allowed: true,
  identifier: 'admission-test',
  limit: 10,
  remaining: 9,
  resetTime: Date.parse('2026-06-02T13:00:00.000Z'),
  retryAfter: 0,
};

test('Feed route admission derives request context, rate-limit identity, and logger facts', () => {
  let rateLimitContext: RequestContext | undefined;

  const admission = admitFeedRouteRequest(
    new Request('https://thedailyfeed.test/api/feeds', {
      method: 'POST',
      headers: {
        'x-request-id': 'feed-admission-request-1',
        'x-forwarded-for': '203.0.113.10, 198.51.100.5',
      },
    }),
    {
      event: 'feed_api_request',
      method: 'POST',
      rateLimitEvent: 'feed_api_rate_limited',
      route: '/api/feeds',
      requestContextPolicy: {
        trustedClientIdentityHeaders: ['x-forwarded-for'],
        generateRequestId: () => 'generated-request-id',
      },
    },
    {
      checkRateLimit: (context) => {
        rateLimitContext = context;
        return {
          ...allowedRateLimit,
          identifier: context.clientIdentity.value,
        };
      },
    }
  );

  assert.equal(admission.requestId, 'feed-admission-request-1');
  assert.equal(admission.requestContext.clientIdentity.value, '203.0.113.10');
  assert.equal(admission.rateLimit.identifier, '203.0.113.10');
  assert.equal(rateLimitContext?.clientIdentity.value, '203.0.113.10');
  assert.deepEqual(admission.loggerFacts, {
    event: 'feed_api_request',
    ip: '203.0.113.10',
    clientIdentitySource: 'trusted-header',
    clientIdentityHeader: 'x-forwarded-for',
    method: 'POST',
    requestId: 'feed-admission-request-1',
    route: '/api/feeds',
  });
});

test('Feed route admission preserves generated request IDs and explicit identity trust policy', () => {
  const admission = admitFeedRouteRequest(
    new Request('https://thedailyfeed.test/api/feeds/validate', {
      method: 'POST',
      headers: {
        'x-request-id': 'r'.repeat(MAX_REQUEST_ID_LENGTH + 1),
        'x-real-ip': '198.51.100.10',
      },
    }),
    {
      event: 'feed_validation_request',
      method: 'POST',
      rateLimitEvent: 'feed_validation_rate_limited',
      route: '/api/feeds/validate',
      requestContextPolicy: {
        trustedClientIdentityHeaders: [],
        generateRequestId: () => 'generated-feed-admission-request',
      },
    },
    {
      checkRateLimit: (context) => ({
        ...allowedRateLimit,
        identifier: context.clientIdentity.value,
      }),
    }
  );

  assert.equal(admission.requestId, 'generated-feed-admission-request');
  assert.equal(admission.requestContext.clientIdentity.value, 'unknown');
  assert.equal(admission.requestContext.clientIdentity.source, 'untrusted');
  assert.equal(admission.rateLimit.identifier, 'unknown');
  assert.deepEqual(admission.loggerFacts, {
    event: 'feed_validation_request',
    ip: 'unknown',
    clientIdentitySource: 'untrusted',
    clientIdentityHeader: undefined,
    method: 'POST',
    requestId: 'generated-feed-admission-request',
    route: '/api/feeds/validate',
  });
});

test('Feed route admission creates the shared rate-limit response contract', async () => {
  const admission = admitFeedRouteRequest(
    new Request('https://thedailyfeed.test/api/feeds', {
      method: 'POST',
      headers: {
        'x-correlation-id': 'feed-admission-blocked',
      },
    }),
    {
      event: 'feed_api_request',
      method: 'POST',
      rateLimitEvent: 'feed_api_rate_limited',
      route: '/api/feeds',
      requestContextPolicy: {
        trustedClientIdentityHeaders: [],
        generateRequestId: () => 'generated-request-id',
      },
    },
    {
      checkRateLimit: (context) => ({
        allowed: false,
        identifier: context.clientIdentity.value,
        limit: 10,
        remaining: 0,
        resetTime: Date.parse('2026-06-02T13:00:00.000Z'),
        retryAfter: 30,
      }),
    }
  );

  assert.deepEqual(admission.rateLimitLogFacts, {
    event: 'feed_api_rate_limited',
    retryAfter: 30,
  });

  const response = admission.createRateLimitedResponse();

  assert.equal(response.status, 429);
  assert.equal(response.headers.get(REQUEST_ID_HEADER), 'feed-admission-blocked');
  assert.equal(response.headers.get('Retry-After'), '30');
  assert.equal(response.headers.get('X-RateLimit-Limit'), '10');
  assert.equal(response.headers.get('X-RateLimit-Remaining'), '0');
  assert.equal(response.headers.get('X-RateLimit-Reset'), '2026-06-02T13:00:00.000Z');
  assert.deepEqual(await response.json(), {
    error: 'Too many requests. Please try again later.',
    retryAfter: 30,
  });
});
