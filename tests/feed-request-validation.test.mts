import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FEEDS_PER_REQUEST } from '../lib/constants.ts';
import {
  normalizeFeedUrl,
  validateFeedRequestBody,
  validateSingleFeedUrlBody,
} from '../lib/feed-request-validation.ts';

test('normalizes and dedupes feed request URLs while preserving first occurrence order', () => {
  const result = validateFeedRequestBody({
    feedUrls: [
      ' HTTPS://Example.com/rss.xml#tracking ',
      'https://example.com/rss.xml',
      'https://example.com/other.xml',
    ],
    timeZone: 'Australia/Melbourne',
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error('Expected feed request validation to pass');
  }

  assert.deepEqual(result.value.feedSet.feedUrls, [
    'https://example.com/rss.xml',
    'https://example.com/other.xml',
  ]);
  assert.equal(result.value.feedSet.timeZone, 'Australia/Melbourne');
  assert.equal(result.value.feedSet.originalFeedCount, 3);
  assert.equal(result.value.feedSet.uniqueFeedCount, 2);
  assert.equal(result.value.feedSet.duplicateFeedCount, 1);
});

test('caps feed URL arrays before per-URL validation', () => {
  const result = validateFeedRequestBody({
    feedUrls: Array.from({ length: MAX_FEEDS_PER_REQUEST + 1 }, () => ({ not: 'a-url' })),
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error('Expected feed request validation to fail');
  }

  assert.equal(result.details.reason, 'too_many_feeds');
  assert.equal(result.details.maxFeedsPerRequest, MAX_FEEDS_PER_REQUEST);
  assert.equal(result.details.invalidUrlCount, undefined);
});

test('returns sanitized invalid URL errors', () => {
  const result = validateFeedRequestBody({
    feedUrls: ['ftp://secret.example.com/private-feed.xml', 42],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error('Expected feed request validation to fail');
  }

  const serialized = JSON.stringify(result.details);
  assert.equal(result.details.reason, 'invalid_feed_urls');
  assert.equal(result.details.invalidUrlCount, 2);
  assert.equal(serialized.includes('secret.example.com'), false);
  assert.equal(serialized.includes('private-feed.xml'), false);
});

test('normalizes a single validation URL', () => {
  const result = validateSingleFeedUrlBody({
    url: ' HTTP://Example.com/feed.atom#reader ',
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error('Expected single feed URL validation to pass');
  }

  assert.equal(result.value.url, 'http://example.com/feed.atom');
});

test('normalizeFeedUrl rejects unsupported schemes without echoing input', () => {
  assert.equal(normalizeFeedUrl('file:///etc/passwd'), null);
});
