import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_FEED_CONTENT_URI_REGEXP,
  FEED_CONTENT_SANITIZER_CONFIG,
} from '../lib/feed-content-sanitizer-policy';

test('feed content sanitizer only allows expected URL protocols', () => {
  assert.equal(ALLOWED_FEED_CONTENT_URI_REGEXP.test('https://example.com/post'), true);
  assert.equal(ALLOWED_FEED_CONTENT_URI_REGEXP.test('http://example.com/post'), true);
  assert.equal(ALLOWED_FEED_CONTENT_URI_REGEXP.test('mailto:author@example.com'), true);
  assert.equal(ALLOWED_FEED_CONTENT_URI_REGEXP.test('javascript:alert(1)'), false);
  assert.equal(ALLOWED_FEED_CONTENT_URI_REGEXP.test('data:text/html,<script>alert(1)</script>'), false);
});

test('feed content sanitizer policy forbids scriptable attributes and data attributes', () => {
  assert.equal(FEED_CONTENT_SANITIZER_CONFIG.ALLOW_DATA_ATTR, false);
  assert.ok(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('href'));
  assert.ok(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('rel'));
  assert.equal(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('onerror'), false);
  assert.equal(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('onclick'), false);
});
