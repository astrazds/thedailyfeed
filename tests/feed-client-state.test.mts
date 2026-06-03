import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FeedApiResponse } from '../lib/types';

type ParserModule = typeof import('../lib/feed-stream-parser');
type FeedStorageModule = typeof import('../lib/feed-storage');
type ConstantsModule = typeof import('../lib/constants');
type OfflineCacheModule = typeof import('../lib/offline-feed-cache');

const parserPath = '../lib/feed-stream-parser.ts';
const feedStoragePath = '../lib/feed-storage.ts';
const constantsPath = '../lib/constants.ts';
const offlineCachePath = '../lib/offline-feed-cache.ts';

type ResolveContext = {
  parentURL?: string;
};

type ResolveResult = {
  shortCircuit?: boolean;
  url: string;
};

type RegisterHooksModule = typeof import('node:module') & {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: ResolveContext,
      nextResolve: (specifier: string, context: ResolveContext) => ResolveResult
    ) => ResolveResult;
  }) => void;
};

const { registerHooks } = ((await import('node:module')) as unknown) as RegisterHooksModule;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL &&
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !specifier.endsWith('.ts') &&
      !specifier.endsWith('.tsx') &&
      !specifier.endsWith('.mts') &&
      !specifier.endsWith('.mjs') &&
      !specifier.endsWith('.js') &&
      !specifier.endsWith('.json')
    ) {
      const candidateUrl = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidateUrl))) {
        return {
          shortCircuit: true,
          url: candidateUrl.href,
        };
      }
    }

    return nextResolve(specifier, context);
  },
});

const {
  deserializeFeedItems,
  mergeAndSortFeedItems,
  parseFeedStreamLine,
  parseFeedStreamText,
} = (await import(parserPath)) as ParserModule;
const { DEFAULT_FEEDS, getFeeds } = (await import(feedStoragePath)) as FeedStorageModule;
const { STORAGE_KEY_FEEDS } = (await import(constantsPath)) as ConstantsModule;
const {
  OFFLINE_FEED_SNAPSHOT_STORAGE_KEY,
  MAX_OFFLINE_SNAPSHOT_BYTES,
  saveOfflineFeedSnapshot,
  loadOfflineFeedSnapshot,
} = (await import(offlineCachePath)) as OfflineCacheModule;

class LocalStorageMock {
  private readonly store = new Map<string, string>();

  throwQuotaOnSet = false;

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.throwQuotaOnSet) {
      const error = new Error('Quota exceeded') as Error & { code?: number };
      error.name = 'QuotaExceededError';
      error.code = 22;
      throw error;
    }

    this.store.set(key, String(value));
  }
}

function installBrowserStorage(): LocalStorageMock {
  const storage = new LocalStorageMock();
  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });
  return storage;
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function feedItem(
  overrides: Partial<FeedApiResponse['items'][number]> = {}
): FeedApiResponse['items'][number] {
  return {
    title: 'Post',
    link: 'https://example.com/post',
    pubDate: '2026-06-01T00:00:00.000Z',
    source: 'Example',
    ...overrides,
  };
}

beforeEach(() => {
  installBrowserStorage();
});

test('parses NDJSON stream chunks across partial reads and validates item shapes', () => {
  const meta = {
    type: 'meta',
    requestId: 'request-1',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 0,
  };
  const feedResult = {
    type: 'feed_result',
    requestId: 'request-1',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 1,
    feedUrl: 'https://example.com/feed.xml',
    status: 'success',
    itemCount: 2,
    items: [
      feedItem({ link: 'https://example.com/valid' }),
      { title: 'invalid', link: 42, pubDate: 'not-a-date', source: 'Example' },
    ],
  };
  const feedResultJson = JSON.stringify(feedResult);

  let parsed = parseFeedStreamText('', `${JSON.stringify(meta)}\n${feedResultJson.slice(0, 12)}`);
  assert.equal(parsed.chunks.length, 1);
  assert.equal(parsed.remaining, feedResultJson.slice(0, 12));

  parsed = parseFeedStreamText(parsed.remaining, `${feedResultJson.slice(12)}\n`);
  assert.equal(parsed.chunks.length, 1);
  const chunk = parsed.chunks[0];
  assert.equal(chunk.type, 'feed_result');
  if (chunk.type === 'feed_result') {
    assert.equal(chunk.items.length, 1);
    assert.equal(chunk.items[0].link, 'https://example.com/valid');
  }
});

test('rejects malformed feed stream chunks', () => {
  assert.throws(
    () => parseFeedStreamLine(JSON.stringify({ type: 'feed_result', requestId: 'request-1' })),
    /Invalid feed stream chunk/
  );
});

test('merges feed items by stable identity and sorts newest first', () => {
  const previous = deserializeFeedItems([
    feedItem({
      link: 'https://example.com/older',
      pubDate: '2026-06-01T01:00:00.000Z',
    }),
  ]);
  const next = deserializeFeedItems([
    feedItem({
      link: 'https://example.com/older',
      pubDate: '2026-06-01T01:00:00.000Z',
    }),
    feedItem({
      link: 'https://example.com/newer',
      pubDate: '2026-06-01T02:00:00.000Z',
    }),
  ]);

  const merged = mergeAndSortFeedItems(previous, next);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].link, 'https://example.com/newer');
  assert.equal(merged[1].link, 'https://example.com/older');
});

test('getFeeds prunes corrupt localStorage feed records and keeps safe valid records', () => {
  const storage = installBrowserStorage();
  storage.setItem(
    STORAGE_KEY_FEEDS,
    JSON.stringify([
      {
        id: 'feed-1',
        url: 'https://example.com/feed.xml',
        name: ' Example ',
        enabled: true,
        addedAt: '2026-02-06T00:00:00.000Z',
      },
      {
        id: 'feed-2',
        url: 'ftp://example.com/feed.xml',
        name: 'Invalid',
        enabled: true,
        addedAt: '2026-02-06T00:00:00.000Z',
      },
      {
        id: 'feed-3',
        url: 'https://example.com/feed.xml',
        name: 'Duplicate',
        enabled: true,
        addedAt: '2026-02-06T00:00:00.000Z',
      },
      { id: 'feed-4' },
    ])
  );

  const feeds = getFeeds();
  assert.equal(feeds.length, 1);
  assert.equal(feeds[0].url, 'https://example.com/feed.xml');
  assert.equal(feeds[0].name, 'Example');
  assert.ok(feeds[0].addedAt instanceof Date);

  const pruned = JSON.parse(storage.getItem(STORAGE_KEY_FEEDS) ?? '[]') as unknown[];
  assert.equal(pruned.length, 1);
});

test('getFeeds returns defaults for non-array localStorage data', () => {
  const storage = installBrowserStorage();
  storage.setItem(STORAGE_KEY_FEEDS, JSON.stringify({ feeds: [] }));

  const feeds = getFeeds();
  assert.deepEqual(
    feeds.map((feed) => feed.id),
    DEFAULT_FEEDS.map((feed) => feed.id)
  );
});

test('offline snapshots validate items and cap serialized snapshot size', () => {
  const storage = installBrowserStorage();
  const items = Array.from({ length: 80 }, (_, index) =>
    feedItem({
      title: `Post ${index}`,
      link: `https://example.com/post-${index}`,
      contentHtml: 'x'.repeat(10_000),
    })
  );

  saveOfflineFeedSnapshot(['https://example.com/feed.xml'], 'UTC', items);

  const stored = JSON.parse(storage.getItem(OFFLINE_FEED_SNAPSHOT_STORAGE_KEY) ?? '[]') as unknown[];
  assert.equal(stored.length, 1);
  assert.ok(byteLength(stored[0]) <= MAX_OFFLINE_SNAPSHOT_BYTES);

  const loaded = loadOfflineFeedSnapshot(['https://example.com/feed.xml'], 'UTC');
  assert.ok(loaded);
  assert.ok(loaded.items.length < items.length);
  assert.ok(loaded.items.length > 0);
});

test('offline snapshot storage loads stale raw snapshots for Feed set lifecycle usability decisions', () => {
  const storage = installBrowserStorage();
  saveOfflineFeedSnapshot(['https://example.com/feed.xml'], 'UTC', [feedItem()]);

  const stored = JSON.parse(
    storage.getItem(OFFLINE_FEED_SNAPSHOT_STORAGE_KEY) ?? '[]'
  ) as Array<{ dayKey?: string }>;
  stored[0].dayKey = '1999-01-01';
  storage.setItem(OFFLINE_FEED_SNAPSHOT_STORAGE_KEY, JSON.stringify(stored));

  const loaded = loadOfflineFeedSnapshot(['https://example.com/feed.xml'], 'UTC');

  assert.ok(loaded);
  assert.equal(loaded.dayKey, '1999-01-01');
});

test('offline snapshots ignore corrupt saved items and tolerate quota failures', () => {
  const storage = installBrowserStorage();
  saveOfflineFeedSnapshot(
    ['https://example.com/feed.xml'],
    'UTC',
    [
      feedItem(),
      {
        title: 'Bad item',
        link: 42,
        pubDate: 'not-a-date',
        source: 'Example',
      } as unknown as FeedApiResponse['items'][number],
    ]
  );

  const loaded = loadOfflineFeedSnapshot(['https://example.com/feed.xml'], 'UTC');
  assert.ok(loaded);
  assert.equal(loaded.items.length, 1);

  storage.throwQuotaOnSet = true;
  assert.doesNotThrow(() => {
    saveOfflineFeedSnapshot(['https://example.com/other.xml'], 'UTC', [feedItem()]);
  });
});
