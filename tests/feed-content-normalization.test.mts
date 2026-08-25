import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmbeddedHeadingLevels,
  normalizeFeedContentDirection,
  normalizeFeedContentLanguage,
} from '../lib/feed-content-normalization';

test('embedded headings begin at h3 and preserve bounded relative structure', () => {
  assert.deepEqual(
    normalizeEmbeddedHeadingLevels([2, 4, 6, 6, 3, 4, 2, 1]),
    [3, 4, 5, 5, 3, 4, 3, 3]
  );
  assert.deepEqual(normalizeEmbeddedHeadingLevels([]), []);
});

test('sanitized content canonicalizes valid language tags and rejects invalid ones', () => {
  assert.equal(normalizeFeedContentLanguage('en-us'), 'en-US');
  assert.equal(normalizeFeedContentLanguage(' zh-hant-tw '), 'zh-Hant-TW');
  assert.equal(normalizeFeedContentLanguage('not_a_language'), null);
  assert.equal(normalizeFeedContentLanguage(''), null);
});

test('sanitized content accepts only supported direction values', () => {
  assert.equal(normalizeFeedContentDirection(' RTL '), 'rtl');
  assert.equal(normalizeFeedContentDirection('ltr'), 'ltr');
  assert.equal(normalizeFeedContentDirection('auto'), 'auto');
  assert.equal(normalizeFeedContentDirection('sideways'), null);
  assert.equal(normalizeFeedContentDirection(''), null);
});
