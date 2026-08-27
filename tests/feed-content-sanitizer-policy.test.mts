import test from 'node:test';
import assert from 'node:assert/strict';
import { FEED_CONTENT_SANITIZER_CONFIG } from '../lib/feed-content-sanitizer-policy';

test('feed content sanitizer policy forbids scriptable attributes and data attributes', () => {
  assert.equal(FEED_CONTENT_SANITIZER_CONFIG.ALLOW_DATA_ATTR, false);
  assert.ok(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('href'));
  assert.ok(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('rel'));
  assert.ok(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('lang'));
  assert.ok(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('dir'));
  assert.equal(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('target'), false);
  assert.equal(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('style'), false);
  assert.equal(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('srcset'), false);
  assert.equal(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('onerror'), false);
  assert.equal(FEED_CONTENT_SANITIZER_CONFIG.ALLOWED_ATTR?.includes('onclick'), false);
  assert.equal('ALLOWED_URI_REGEXP' in FEED_CONTENT_SANITIZER_CONFIG, false);
});
