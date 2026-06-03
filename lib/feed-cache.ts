/**
 * Feed caching utilities
 * Per-feed in-memory cache with TTL and max-entry eviction.
 */

import { createHash } from 'node:crypto';
import type { FeedItem } from './rss';
import {
  FEED_CACHE_TTL_MS,
  FEED_CACHE_MAX_ENTRIES,
  CACHE_CLEANUP_INTERVAL_MS,
} from './constants';

interface CacheEntry {
  items: FeedItem[];
  timestamp: number;
}

// Keyed by feed URL for granular cache reuse.
const feedCache = new Map<string, CacheEntry>();

function isCacheValid(entry: CacheEntry): boolean {
  const now = Date.now();
  const age = now - entry.timestamp;
  return age < FEED_CACHE_TTL_MS;
}

function cloneItems(items: FeedItem[]): FeedItem[] {
  return items.map((item) => ({
    ...item,
    pubDate: new Date(item.pubDate),
  }));
}

function evictOldestEntries(): void {
  while (feedCache.size > FEED_CACHE_MAX_ENTRIES) {
    const oldestKey = feedCache.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }

    feedCache.delete(oldestKey);
  }
}

function touchCacheEntry(feedUrl: string, entry: CacheEntry): void {
  feedCache.delete(feedUrl);
  feedCache.set(feedUrl, entry);
}

export function getRedactedFeedId(feedUrl: string): string {
  return `feed:${createHash('sha256').update(feedUrl).digest('hex').slice(0, 16)}`;
}

export function getCachedFeed(feedUrl: string): FeedItem[] | null {
  const entry = feedCache.get(feedUrl);
  if (!entry) {
    return null;
  }

  if (!isCacheValid(entry)) {
    feedCache.delete(feedUrl);
    return null;
  }

  touchCacheEntry(feedUrl, entry);
  return cloneItems(entry.items);
}

export function cacheFeed(feedUrl: string, items: FeedItem[]): void {
  feedCache.delete(feedUrl);
  feedCache.set(feedUrl, {
    items: cloneItems(items),
    timestamp: Date.now(),
  });
  evictOldestEntries();
}

export function getCachedFeedSplit(feedUrls: string[]): {
  cached: Array<{ feedUrl: string; items: FeedItem[] }>;
  missing: string[];
} {
  const cached: Array<{ feedUrl: string; items: FeedItem[] }> = [];
  const missing: string[] = [];

  for (const feedUrl of feedUrls) {
    const items = getCachedFeed(feedUrl);
    if (items) {
      cached.push({ feedUrl, items });
    } else {
      missing.push(feedUrl);
    }
  }

  return { cached, missing };
}

export function cleanupExpiredCache(): void {
  for (const [key, entry] of feedCache.entries()) {
    if (!isCacheValid(entry)) {
      feedCache.delete(key);
    }
  }

  evictOldestEntries();
}

export function clearFeedCache(): void {
  feedCache.clear();
}

export function getCacheStats() {
  return {
    size: feedCache.size,
    maxEntries: FEED_CACHE_MAX_ENTRIES,
    entries: Array.from(feedCache.entries()).map(([feedUrl, entry]) => ({
      feedId: getRedactedFeedId(feedUrl),
      itemCount: entry.items.length,
      age: Date.now() - entry.timestamp,
      valid: isCacheValid(entry),
    })),
  };
}

if (typeof window === 'undefined') {
  const cleanupTimer = setInterval(cleanupExpiredCache, CACHE_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();
}
