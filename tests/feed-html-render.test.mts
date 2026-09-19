import test from 'node:test';
import assert from 'node:assert/strict';
import { unsanitizedFeedHtmlFallback } from '../lib/feed-html-render';

test('untrusted HTML is empty when the DOM is unavailable', () => {
  const fallback = unsanitizedFeedHtmlFallback();

  assert.equal(fallback.sanitized, '');
  assert.equal(fallback.truncated.html, '');
  assert.equal(fallback.truncated.truncated, false);
  assert.equal(fallback.sanitized.includes('<script>'), false);
});
