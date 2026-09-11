import test from 'node:test';
import assert from 'node:assert/strict';
import { FEED_CACHE_MAX_ENTRIES } from '../lib/constants.ts';
import {
  cacheFeed,
  clearFeedCache,
  getCachedFeed,
  getCacheStats,
} from '../lib/feed-cache.ts';
import type { FeedItem } from '../lib/types.ts';

function createItem(index: number): FeedItem {
  return {
    title: `Item ${index}`,
    link: `https://example.com/items/${index}`,
    pubDate: new Date('2026-01-01T00:00:00.000Z'),
    source: 'Example',
  };
}

test('cache metrics redact raw feed URLs', () => {
  clearFeedCache();
  const feedUrl = 'https://secret.example.com/private-feed.xml?token=abc123';

  cacheFeed(feedUrl, [createItem(1)]);

  const stats = getCacheStats();
  const serialized = JSON.stringify(stats);

  assert.equal(stats.size, 1);
  assert.equal(stats.maxEntries, FEED_CACHE_MAX_ENTRIES);
  assert.equal('feedUrl' in stats.entries[0], false);
  assert.equal(typeof stats.entries[0]?.feedId, 'string');
  assert.equal(serialized.includes(feedUrl), false);
  assert.equal(serialized.includes('secret.example.com'), false);
  assert.equal(serialized.includes('abc123'), false);
});

test('cache evicts oldest entries beyond max size', () => {
  clearFeedCache();
  const firstFeedUrl = 'https://example.com/oldest.xml';

  cacheFeed(firstFeedUrl, [createItem(0)]);
  for (let index = 1; index <= FEED_CACHE_MAX_ENTRIES; index += 1) {
    cacheFeed(`https://example.com/feed-${index}.xml`, [createItem(index)]);
  }

  const stats = getCacheStats();

  assert.equal(stats.size, FEED_CACHE_MAX_ENTRIES);
  assert.equal(getCachedFeed(firstFeedUrl), null);
});
