import test from 'node:test';
import assert from 'node:assert/strict';
import type { FeedItem } from '../lib/rss';
import {
  applyFeedSetApiResponse,
  applyFeedSetStreamChunk,
  beginFeedSetLifecycle,
  failFeedSetLifecycle,
  finishFeedSetLifecycle,
} from '../lib/feed-set-lifecycle';

function feedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: 'Post',
    link: 'https://example.com/post',
    pubDate: new Date('2026-06-02T09:00:00.000Z'),
    source: 'Example',
    ...overrides,
  };
}

function serializedFeedItem(overrides: Partial<FeedItem> = {}) {
  const item = feedItem(overrides);
  return {
    ...item,
    pubDate: item.pubDate.toISOString(),
  };
}

test('exposes a user-facing read model without implementation lifecycle bookkeeping', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: {
      timeZone: 'UTC',
      dayKey: '2026-06-02',
      items: [serializedFeedItem({ title: 'Cached' })],
    },
  });

  assert.equal(started.readModel.loading, true);
  assert.equal(started.readModel.isCached, true);
  assert.equal(started.readModel.items[0].title, 'Cached');
  assert.equal('hasAppliedNetworkResults' in started.readModel, false);
});

test('applies progressive feed results by merging duplicate items and tracking feed status', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    snapshot: null,
  });

  const first = applyFeedSetStreamChunk(started.state, {
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
      serializedFeedItem(),
      serializedFeedItem({
        title: 'Newer',
        link: 'https://example.com/newer',
        pubDate: new Date('2026-06-02T10:00:00.000Z'),
      }),
    ],
  });

  const second = applyFeedSetStreamChunk(first.state, {
    type: 'feed_result',
    requestId: 'request-1',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 1,
    feedUrl: 'https://example.com/feed.xml',
    status: 'success',
    itemCount: 1,
    items: [serializedFeedItem()],
  });

  assert.equal(second.readModel.requestId, 'request-1');
  assert.deepEqual(
    second.readModel.items.map((item) => item.link),
    ['https://example.com/newer', 'https://example.com/post']
  );
  assert.deepEqual(second.readModel.feedStatuses, [
    {
      feedUrl: 'https://example.com/feed.xml',
      feedName: 'Example',
      status: 'success',
      itemCount: 1,
    },
  ]);
});

test('previews a fresh offline snapshot but rejects a stale snapshot', () => {
  const fresh = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: {
      timeZone: 'UTC',
      dayKey: '2026-06-02',
      items: [serializedFeedItem({ title: 'Cached' })],
    },
  });

  assert.equal(fresh.readModel.isCached, true);
  assert.equal(fresh.readModel.items.length, 1);
  assert.equal(fresh.readModel.items[0].title, 'Cached');

  const stale = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: {
      timeZone: 'UTC',
      dayKey: '2026-06-01',
      items: [serializedFeedItem({ title: 'Stale' })],
    },
  });

  assert.equal(stale.readModel.isCached, false);
  assert.equal(stale.readModel.items.length, 0);
});

test('rejects an offline snapshot from a different timezone', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'Australia/Melbourne',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: {
      timeZone: 'UTC',
      dayKey: '2026-06-02',
      items: [serializedFeedItem({ title: 'Wrong timezone' })],
    },
  });

  assert.equal(started.readModel.isCached, false);
  assert.equal(started.readModel.items.length, 0);
});

test('replaces an offline preview with live progressive results after the network responds', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: {
      timeZone: 'UTC',
      dayKey: '2026-06-02',
      items: [
        serializedFeedItem({
          title: 'Cached only',
          link: 'https://example.com/cached-only',
        }),
      ],
    },
  });

  const next = applyFeedSetStreamChunk(started.state, {
    type: 'feed_result',
    requestId: 'request-2',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 1,
    feedUrl: 'https://example.com/feed.xml',
    status: 'success',
    itemCount: 1,
    items: [
      serializedFeedItem({
        title: 'Live',
        link: 'https://example.com/live',
      }),
    ],
  });

  assert.equal(next.readModel.isCached, false);
  assert.deepEqual(
    next.readModel.items.map((item) => item.link),
    ['https://example.com/live']
  );
});

test('uses a fresh offline snapshot as the terminal fallback for network failure', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: null,
  });

  const fallback = failFeedSetLifecycle(started.state, {
    error: new Error('network failed'),
    now: new Date('2026-06-02T12:00:00.000Z'),
    fallbackSnapshot: {
      timeZone: 'UTC',
      dayKey: '2026-06-02',
      items: [serializedFeedItem({ title: 'Fallback' })],
    },
  });

  assert.equal(fallback.readModel.loading, false);
  assert.equal(fallback.readModel.error, null);
  assert.equal(fallback.readModel.isCached, true);
  assert.equal(fallback.readModel.items[0].title, 'Fallback');

  const failed = failFeedSetLifecycle(started.state, {
    error: new Error('network failed'),
    now: new Date('2026-06-02T12:00:00.000Z'),
    fallbackSnapshot: null,
  });

  assert.equal(failed.readModel.loading, false);
  assert.equal(failed.readModel.error, 'Failed to load feeds. Please try again.');
  assert.equal(failed.readModel.isCached, false);
});

test('rejects a stale offline snapshot as the terminal fallback for network failure', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: null,
  });

  const failed = failFeedSetLifecycle(started.state, {
    error: new Error('network failed'),
    now: new Date('2026-06-02T12:00:00.000Z'),
    fallbackSnapshot: {
      timeZone: 'UTC',
      dayKey: '2026-06-01',
      items: [serializedFeedItem({ title: 'Stale fallback' })],
    },
  });

  assert.equal(failed.readModel.loading, false);
  assert.equal(failed.readModel.error, 'Failed to load feeds. Please try again.');
  assert.equal(failed.readModel.isCached, false);
  assert.equal(failed.readModel.items.length, 0);
});

test('surfaces the Request ID in the client-facing error after stream metadata arrives', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: null,
  });
  const withRequestId = applyFeedSetStreamChunk(started.state, {
    type: 'meta',
    requestId: 'request-visible',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 0,
  });

  const failed = failFeedSetLifecycle(withRequestId.state, {
    error: new Error('network failed'),
    now: new Date('2026-06-02T12:00:00.000Z'),
    fallbackSnapshot: null,
  });

  assert.equal(
    failed.readModel.error,
    'Failed to load feeds. Please try again. Request ID: request-visible.'
  );
});

test('persists the accumulated live items and clears progress on done', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: null,
  });
  const withItems = applyFeedSetStreamChunk(started.state, {
    type: 'feed_result',
    requestId: 'request-3',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 1,
    feedUrl: 'https://example.com/feed.xml',
    status: 'success',
    itemCount: 1,
    items: [serializedFeedItem({ title: 'Live' })],
  });

  const done = applyFeedSetStreamChunk(withItems.state, {
    type: 'done',
    requestId: 'request-3',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 1,
    totalItemCount: 1,
  });

  assert.equal(done.readModel.loading, false);
  assert.equal(done.readModel.completedFeeds, 0);
  assert.equal(done.readModel.totalFeeds, 0);
  assert.deepEqual(done.effects, [
    {
      type: 'persist_offline_snapshot',
      feedUrls: ['https://example.com/feed.xml'],
      timeZone: 'UTC',
      items: [serializedFeedItem({ title: 'Live' })],
    },
  ]);
});

test('applies a terminal non-stream API response and records snapshot persistence', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: null,
  });

  const next = applyFeedSetApiResponse(started.state, {
    cached: true,
    items: [serializedFeedItem({ title: 'Cached response' })],
    timeZone: 'UTC',
  });

  assert.equal(next.readModel.loading, false);
  assert.equal(next.readModel.isCached, true);
  assert.equal(next.readModel.completedFeeds, 0);
  assert.equal(next.readModel.totalFeeds, 0);
  assert.deepEqual(next.readModel.feedStatuses, [
    {
      feedUrl: 'https://example.com/feed.xml',
      feedName: 'Example',
      status: 'cached',
      itemCount: 1,
    },
  ]);
  assert.deepEqual(next.effects, [
    {
      type: 'persist_offline_snapshot',
      feedUrls: ['https://example.com/feed.xml'],
      timeZone: 'UTC',
      items: [serializedFeedItem({ title: 'Cached response' })],
    },
  ]);
});

test('starts without loading when there are no enabled feeds', () => {
  const started = beginFeedSetLifecycle({
    feeds: [],
    configuredFeedCount: 2,
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: null,
  });

  assert.deepEqual(started.readModel.items, []);
  assert.equal(started.readModel.loading, false);
  assert.equal(started.readModel.error, 'no-feeds');
  assert.equal(started.readModel.isCached, false);
  assert.equal(started.readModel.configuredFeedCount, 2);
  assert.equal(started.readModel.enabledFeedCount, 0);
  assert.deepEqual(started.readModel.feedStatuses, []);
  assert.deepEqual(started.effects, []);
});

test('keeps configured and enabled feed counts through loading, completion, and failure', () => {
  const started = beginFeedSetLifecycle({
    feeds: [
      { url: 'https://example.com/one.xml', name: 'One' },
      { url: 'https://example.com/two.xml', name: 'Two' },
    ],
    configuredFeedCount: 3,
    timeZone: 'UTC',
    snapshot: null,
  });

  assert.equal(started.readModel.configuredFeedCount, 3);
  assert.equal(started.readModel.enabledFeedCount, 2);

  const completed = applyFeedSetApiResponse(started.state, {
    cached: false,
    items: [],
    timeZone: 'UTC',
  });
  assert.equal(completed.readModel.configuredFeedCount, 3);
  assert.equal(completed.readModel.enabledFeedCount, 2);

  const failed = failFeedSetLifecycle(started.state, {
    error: new Error('network failed'),
    fallbackSnapshot: null,
  });
  assert.equal(failed.readModel.configuredFeedCount, 3);
  assert.equal(failed.readModel.enabledFeedCount, 2);
});

test('finishes an ended stream without persisting when no done chunk arrived', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: null,
  });
  const withProgress = applyFeedSetStreamChunk(started.state, {
    type: 'meta',
    requestId: 'request-4',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 0,
  });

  const finished = finishFeedSetLifecycle(withProgress.state);

  assert.equal(finished.readModel.loading, false);
  assert.equal(finished.readModel.completedFeeds, 0);
  assert.equal(finished.readModel.totalFeeds, 0);
  assert.deepEqual(finished.effects, []);
});
