import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY_FEEDS } from '../lib/constants';
import type { Feed } from '../lib/feed-storage';
import { runFeedManagerOperation } from '../lib/feed-manager-operations';

class LocalStorageMock {
  private readonly store = new Map<string, string>();

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function installBrowserBoundary(): LocalStorageMock {
  const storage = new LocalStorageMock();
  const events = new EventTarget();
  const browser = {
    dispatchEvent: events.dispatchEvent.bind(events),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };

  Object.defineProperty(globalThis, 'window', {
    value: browser,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });

  return storage;
}

beforeEach(() => {
  installBrowserBoundary();
});

function saveStoredFeeds(feeds: Feed[]): void {
  localStorage.setItem(STORAGE_KEY_FEEDS, JSON.stringify(feeds));
}

function feed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: 'feed-1',
    name: 'Example',
    url: 'https://example.com/rss.xml',
    enabled: true,
    addedAt: new Date('2026-02-06T00:00:00.000Z'),
    ...overrides,
  };
}

test('add operation validates, persists, returns mutation facts, and notifies feed listeners', async () => {
  const seenEvents: string[] = [];
  window.addEventListener('feedsUpdated', (event) => {
    seenEvents.push(event.type);
  });

  const validatedUrls: string[] = [];
  const result = await runFeedManagerOperation({
    type: 'add',
    name: ' Example Feed ',
    url: ' https://example.com/rss.xml ',
    validateFeedUrl: async (url) => {
      validatedUrls.push(url);
    },
  });

  assert.deepEqual(validatedUrls, ['https://example.com/rss.xml']);
  assert.equal(result.feeds.length, 4);
  assert.equal(result.feeds.at(-1)?.name, 'Example Feed');
  assert.equal(result.feeds.at(-1)?.url, 'https://example.com/rss.xml');
  assert.equal(result.mutation.type, 'add');
  assert.equal(result.mutation.enabledFeedSetChanged, true);
  assert.deepEqual(
    result.mutation.changedFeeds.map((item) => item.url),
    ['https://example.com/rss.xml']
  );
  assert.deepEqual(seenEvents, ['feedsUpdated']);

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FEEDS) ?? '[]') as unknown[];
  assert.equal(stored.length, 4);
});

test('add operation returns mutation facts without modal reset state', async () => {
  const seenEvents: string[] = [];
  window.addEventListener('feedsUpdated', (event) => {
    seenEvents.push(event.type);
  });

  const result = await runFeedManagerOperation({
    type: 'add',
    name: ' Example Feed ',
    url: ' https://example.com/rss.xml ',
    validateFeedUrl: async () => {},
  });

  assert.equal('formState' in result, false);
  assert.equal(result.mutation.type, 'add');
  assert.equal(result.mutation.enabledFeedSetChanged, true);
  assert.deepEqual(
    result.mutation.changedFeeds.map((item) => item.url),
    ['https://example.com/rss.xml']
  );
  assert.deepEqual(seenEvents, ['feedsUpdated']);
});

test('add operation preserves duplicate detection without notifying feed listeners', async () => {
  saveStoredFeeds([feed()]);
  const seenEvents: string[] = [];
  window.addEventListener('feedsUpdated', (event) => {
    seenEvents.push(event.type);
  });

  await assert.rejects(
    runFeedManagerOperation({
      type: 'add',
      name: 'Duplicate',
      url: 'https://example.com/rss.xml',
      validateFeedUrl: async () => {},
    }),
    /Feed already exists: Example/
  );

  assert.deepEqual(seenEvents, []);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FEEDS) ?? '[]') as unknown[];
  assert.equal(stored.length, 1);
});

test('add operation preserves validation failure behavior without mutating storage', async () => {
  saveStoredFeeds([feed()]);
  const seenEvents: string[] = [];
  window.addEventListener('feedsUpdated', (event) => {
    seenEvents.push(event.type);
  });

  await assert.rejects(
    runFeedManagerOperation({
      type: 'add',
      name: 'Invalid',
      url: 'https://example.com/invalid.xml',
      validateFeedUrl: async () => {
        throw new Error('Feed validation failed');
      },
    }),
    /Feed validation failed/
  );

  assert.deepEqual(seenEvents, []);
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FEEDS) ?? '[]') as unknown[];
  assert.equal(stored.length, 1);
});

test('edit operation validates, persists changes, reports mutation facts, and notifies feed listeners', async () => {
  saveStoredFeeds([feed()]);
  const seenEvents: string[] = [];
  window.addEventListener('feedsUpdated', (event) => {
    seenEvents.push(event.type);
  });

  const validatedUrls: string[] = [];
  const result = await runFeedManagerOperation({
    type: 'edit',
    id: 'feed-1',
    name: ' Renamed ',
    url: ' https://example.com/updated.xml ',
    validateFeedUrl: async (url) => {
      validatedUrls.push(url);
    },
  });

  assert.deepEqual(validatedUrls, ['https://example.com/updated.xml']);
  assert.equal(result.feeds.length, 1);
  assert.equal(result.feeds[0].name, 'Renamed');
  assert.equal(result.feeds[0].url, 'https://example.com/updated.xml');
  assert.equal(result.mutation.type, 'edit');
  assert.equal(result.mutation.enabledFeedSetChanged, true);
  assert.deepEqual(
    result.mutation.changedFeeds.map((item) => item.url),
    ['https://example.com/updated.xml']
  );
  assert.deepEqual(seenEvents, ['feedsUpdated']);
});

test('toggle operation flips enabled state and notifies feed listeners', async () => {
  saveStoredFeeds([feed({ enabled: true })]);
  const seenEvents: string[] = [];
  window.addEventListener('feedsUpdated', (event) => {
    seenEvents.push(event.type);
  });

  const result = await runFeedManagerOperation({
    type: 'toggle',
    id: 'feed-1',
  });

  assert.equal(result.feeds.length, 1);
  assert.equal(result.feeds[0].enabled, false);
  assert.equal(result.mutation.type, 'toggle');
  assert.deepEqual(
    result.mutation.changedFeeds.map((item) => item.id),
    ['feed-1']
  );
  assert.deepEqual(seenEvents, ['feedsUpdated']);

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FEEDS) ?? '[]') as Feed[];
  assert.equal(stored[0].enabled, false);
});

test('operation result reports Feed set changes and notifies only for real enabled Feed set changes', async () => {
  saveStoredFeeds([feed({ enabled: true })]);
  const seenEvents: string[] = [];
  window.addEventListener('feedsUpdated', (event) => {
    seenEvents.push(event.type);
  });

  const missingToggleResult = await runFeedManagerOperation({
    type: 'toggle',
    id: 'missing-feed',
  });

  assert.equal(missingToggleResult.mutation.enabledFeedSetChanged, false);
  assert.deepEqual(missingToggleResult.mutation.changedFeeds, []);
  assert.deepEqual(
    missingToggleResult.feeds.map((item) => item.url),
    ['https://example.com/rss.xml']
  );
  assert.deepEqual(seenEvents, []);

  const duplicateImportResult = await runFeedManagerOperation({
    type: 'import-opml',
    feeds: [
      { name: 'Duplicate', url: 'https://example.com/rss.xml' },
      { name: 'Bad', url: 'ftp://example.com/private.xml' },
    ],
  });

  assert.equal(duplicateImportResult.mutation.enabledFeedSetChanged, false);
  assert.deepEqual(duplicateImportResult.mutation.changedFeeds, []);
  assert.deepEqual(duplicateImportResult.mutation.importSummary, {
    added: 0,
    skippedDuplicate: 1,
    invalid: 1,
    overLimit: 0,
  });
  assert.deepEqual(seenEvents, []);

  const realChangeResult = await runFeedManagerOperation({
    type: 'toggle',
    id: 'feed-1',
  });

  assert.equal(realChangeResult.mutation.enabledFeedSetChanged, true);
  assert.equal(realChangeResult.feeds[0].enabled, false);
  assert.deepEqual(seenEvents, ['feedsUpdated']);
});

test('operations preserve corrupt storage pruning while returning the next feed set', async () => {
  localStorage.setItem(
    STORAGE_KEY_FEEDS,
    JSON.stringify([
      {
        id: 'feed-1',
        url: 'https://example.com/rss.xml',
        name: ' Example ',
        enabled: true,
        addedAt: '2026-02-06T00:00:00.000Z',
      },
      {
        id: 'bad-feed',
        url: 'ftp://example.com/private.xml',
        name: 'Bad',
        enabled: true,
        addedAt: '2026-02-06T00:00:00.000Z',
      },
      { id: 'missing-fields' },
    ])
  );

  const result = await runFeedManagerOperation({
    type: 'toggle',
    id: 'feed-1',
  });

  assert.equal(result.feeds.length, 1);
  assert.equal(result.feeds[0].name, 'Example');
  assert.equal(result.feeds[0].enabled, false);

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FEEDS) ?? '[]') as unknown[];
  assert.equal(stored.length, 1);
});

test('delete operation removes a feed and notifies feed listeners', async () => {
  saveStoredFeeds([
    feed(),
    feed({
      id: 'feed-2',
      name: 'Second',
      url: 'https://example.com/second.xml',
    }),
  ]);
  const seenEvents: string[] = [];
  window.addEventListener('feedsUpdated', (event) => {
    seenEvents.push(event.type);
  });

  const result = await runFeedManagerOperation({
    type: 'delete',
    id: 'feed-1',
  });

  assert.deepEqual(
    result.feeds.map((item) => item.id),
    ['feed-2']
  );
  assert.equal(result.mutation.type, 'delete');
  assert.deepEqual(
    result.mutation.changedFeeds.map((item) => item.id),
    ['feed-1']
  );
  assert.deepEqual(seenEvents, ['feedsUpdated']);
});

test('OPML import adds valid feeds and summarizes duplicate and invalid entries', async () => {
  saveStoredFeeds([feed()]);
  const seenEvents: string[] = [];
  window.addEventListener('feedsUpdated', (event) => {
    seenEvents.push(event.type);
  });

  const result = await runFeedManagerOperation({
    type: 'import-opml',
    feeds: [
      { name: 'Duplicate', url: 'https://example.com/rss.xml' },
      { name: 'Imported', url: 'https://example.com/imported.xml' },
      { name: 'Bad', url: 'ftp://example.com/private.xml' },
      { name: '  ', url: 'https://example.com/nameless.xml' },
    ],
  });

  assert.equal(result.feeds.length, 2);
  assert.equal(result.feeds[1].name, 'Imported');
  assert.equal(result.feeds[1].url, 'https://example.com/imported.xml');
  assert.equal(result.mutation.type, 'import-opml');
  assert.deepEqual(
    result.mutation.changedFeeds.map((item) => item.url),
    ['https://example.com/imported.xml']
  );
  assert.deepEqual(result.mutation.importSummary, {
    added: 1,
    skippedDuplicate: 1,
    invalid: 2,
    overLimit: 0,
  });
  assert.deepEqual(seenEvents, ['feedsUpdated']);
});

test('OPML import summary follows Feed storage URL duplicate semantics', async () => {
  saveStoredFeeds([feed()]);

  const result = await runFeedManagerOperation({
    type: 'import-opml',
    feeds: [
      { name: 'Default port variant', url: 'https://example.com:443/rss.xml' },
    ],
  });

  assert.equal(result.feeds.length, 2);
  assert.equal(result.feeds[1].url, 'https://example.com:443/rss.xml');
  assert.deepEqual(result.mutation.importSummary, {
    added: 1,
    skippedDuplicate: 0,
    invalid: 0,
    overLimit: 0,
  });
});

test('OPML import caps additions over the configured feed limit', async () => {
  saveStoredFeeds([feed()]);
  const seenEvents: string[] = [];
  window.addEventListener('feedsUpdated', (event) => {
    seenEvents.push(event.type);
  });

  const result = await runFeedManagerOperation({
    type: 'import-opml',
    maxFeeds: 2,
    feeds: [
      { name: 'Imported 1', url: 'https://example.com/imported-1.xml' },
      { name: 'Imported 2', url: 'https://example.com/imported-2.xml' },
    ],
  });

  assert.equal(result.feeds.length, 2);
  assert.deepEqual(result.mutation.importSummary, {
    added: 1,
    skippedDuplicate: 0,
    invalid: 0,
    overLimit: 1,
  });
  assert.deepEqual(seenEvents, ['feedsUpdated']);
});

function inventory(count: number): Feed[] {
  return Array.from({ length: count }, (_, i) => feed({
    id: `feed-${i}`, url: `https://example.com/${i}.xml`, enabled: i % 2 === 0,
  }));
}

test('manual additions allow 49 to 50 but reject a full inventory before validation', async () => {
  saveStoredFeeds(inventory(49));
  const operation = { type: 'add' as const, name: 'Last', url: 'https://example.com/last.xml', validateFeedUrl: async () => {} };
  assert.equal((await runFeedManagerOperation(operation)).feeds.length, 50);
  let validated = false;
  await assert.rejects(runFeedManagerOperation({ ...operation, url: 'https://example.com/extra.xml', validateFeedUrl: async () => { validated = true; } }), /50 feeds/);
  assert.equal(validated, false);
  assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY_FEEDS)!).length, 50);
});

test('manual addition checks current storage after validation and preserves oversized inventories', async () => {
  saveStoredFeeds(inventory(49));
  await assert.rejects(runFeedManagerOperation({
    type: 'add', name: 'Late', url: 'https://example.com/late.xml',
    validateFeedUrl: async () => { saveStoredFeeds(inventory(51)); },
  }), /50 feeds/);
  assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY_FEEDS)!).length, 51);
});

for (const type of ['add', 'edit', 'toggle', 'delete', 'import-opml'] as const) {
  test(`${type} rejects failed persistence without changing storage or notifying listeners`, async () => {
    saveStoredFeeds([feed()]);
    const before = localStorage.getItem(STORAGE_KEY_FEEDS);
    let events = 0;
    window.addEventListener('feedsUpdated', () => events++);
    localStorage.setItem = () => { throw new Error('Quota exceeded'); };
    const input = { name: 'Changed', url: 'https://example.com/new.xml', validateFeedUrl: async () => {} };
    const operation = type === 'add' ? { type, ...input }
      : type === 'edit' ? { type, id: 'feed-1', ...input }
      : type === 'import-opml' ? { type, feeds: [input] }
      : { type, id: 'feed-1' };
    await assert.rejects(runFeedManagerOperation(operation), /browser storage/);
    assert.equal(localStorage.getItem(STORAGE_KEY_FEEDS), before);
    assert.equal(events, 0);
  });
}

test('failed cleanup persistence still returns valid records already read', async () => {
  const { getFeeds } = await import('../lib/feed-storage');
  localStorage.setItem(STORAGE_KEY_FEEDS, JSON.stringify([feed(), { invalid: true }]));
  localStorage.setItem = () => { throw new Error('Storage unavailable'); };
  assert.deepEqual(getFeeds(), [feed()]);
});
