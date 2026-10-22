import test from 'node:test';
import assert from 'node:assert/strict';
import type { FeedItem } from '../lib/types';
import {
  applyFeedSetApiResponse,
  applyFeedSetStreamChunk,
  beginFeedSetLifecycle,
  continueFeedSetLifecycle,
  failFeedSetLifecycle,
  finishFeedSetLifecycle,
  type FeedSetPhase,
} from '../lib/feed-set-lifecycle';
import { activityOf } from '../lib/feed-load-activity';

function shown(phase: FeedSetPhase) {
  const items = phase.kind === 'no-feeds' ? [] : phase.items;
  const feedStatuses = phase.kind === 'no-feeds' ? [] : phase.feedStatuses;
  const requestId = phase.kind === 'no-feeds' ? null : phase.requestId;
  return {
    items,
    loading: phase.kind === 'loading',
    error: phase.kind === 'failed' ? phase.message : phase.kind === 'no-feeds' ? 'no-feeds' : null,
    isCached: phase.kind === 'loading' ? phase.preview === 'snapshot' : phase.kind === 'snapshot-fallback' ? true : 'cached' in phase ? phase.cached : false,
    refreshNotice: phase.kind === 'snapshot-fallback' ? 'snapshot-fallback' as const : null,
    completedFeeds: phase.kind === 'loading' ? phase.completedFeeds : 0,
    totalFeeds: phase.kind === 'loading' ? phase.totalFeeds : 0,
    feedStatuses,
    requestId,
    enabledFeedCount: phase.kind === 'no-feeds' ? 0 : feedStatuses.length,
  };
}

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

  assert.equal(started.phase.kind, 'loading');
  assert.equal(started.phase.preview, 'snapshot');
  assert.equal(started.phase.items[0].title, 'Cached');
  assert.equal('hasAppliedNetworkResults' in started.phase, false);
  assert.equal(shown(started.phase).loading, true);
  assert.equal(shown(started.phase).isCached, true);
});

test('applies progressive feed results by merging duplicate items and tracking feed status', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    snapshot: null,
  });

  const first = applyFeedSetStreamChunk(started.phase, {
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

  const second = applyFeedSetStreamChunk(first.phase, {
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

  assert.equal(shown(second.phase).requestId, 'request-1');
  assert.deepEqual(
    shown(second.phase).items.map((item) => item.link),
    ['https://example.com/newer', 'https://example.com/post']
  );
  assert.deepEqual(shown(second.phase).feedStatuses, [
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

  assert.equal(shown(fresh.phase).isCached, true);
  assert.equal(shown(fresh.phase).items.length, 1);
  assert.equal(shown(fresh.phase).items[0].title, 'Cached');

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

  assert.equal(shown(stale.phase).isCached, false);
  assert.equal(shown(stale.phase).items.length, 0);
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

  assert.equal(shown(started.phase).isCached, false);
  assert.equal(shown(started.phase).items.length, 0);
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

  const next = applyFeedSetStreamChunk(started.phase, {
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

  assert.equal(shown(next.phase).isCached, false);
  assert.deepEqual(
    shown(next.phase).items.map((item) => item.link),
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

  const fallback = failFeedSetLifecycle(started.phase, {
    error: new Error('network failed'),
    now: new Date('2026-06-02T12:00:00.000Z'),
    fallbackSnapshot: {
      timeZone: 'UTC',
      dayKey: '2026-06-02',
      items: [serializedFeedItem({ title: 'Fallback' })],
    },
  });

  assert.equal(shown(fallback.phase).loading, false);
  assert.equal(shown(fallback.phase).error, null);
  assert.equal(shown(fallback.phase).isCached, true);
  assert.equal(shown(fallback.phase).refreshNotice, 'snapshot-fallback');
  assert.equal(shown(fallback.phase).items[0].title, 'Fallback');

  const failed = failFeedSetLifecycle(started.phase, {
    error: new Error('network failed'),
    now: new Date('2026-06-02T12:00:00.000Z'),
    fallbackSnapshot: null,
  });

  assert.equal(shown(failed.phase).loading, false);
  assert.equal(shown(failed.phase).error, 'Failed to load feeds. Please try again.');
  assert.equal(shown(failed.phase).isCached, false);
  assert.equal(shown(failed.phase).refreshNotice, null);
});

test('clears the snapshot fallback notice when network progress resumes', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    snapshot: null,
  });
  const fallback = failFeedSetLifecycle(started.phase, {
    error: new Error('network failed'),
    now: new Date('2026-06-02T12:00:00.000Z'),
    fallbackSnapshot: {
      timeZone: 'UTC',
      dayKey: '2026-06-02',
      items: [serializedFeedItem({ title: 'Fallback' })],
    },
  });

  const resumed = applyFeedSetStreamChunk(fallback.phase, {
    type: 'feed_result',
    requestId: 'request-resumed',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 1,
    feedUrl: 'https://example.com/feed.xml',
    status: 'success',
    itemCount: 1,
    items: [serializedFeedItem({ title: 'Live' })],
  });

  assert.equal(shown(resumed.phase).refreshNotice, null);
  assert.equal(shown(resumed.phase).items[0].title, 'Live');
});

test('rejects a stale offline snapshot as the terminal fallback for network failure', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: null,
  });

  const failed = failFeedSetLifecycle(started.phase, {
    error: new Error('network failed'),
    now: new Date('2026-06-02T12:00:00.000Z'),
    fallbackSnapshot: {
      timeZone: 'UTC',
      dayKey: '2026-06-01',
      items: [serializedFeedItem({ title: 'Stale fallback' })],
    },
  });

  assert.equal(shown(failed.phase).loading, false);
  assert.equal(shown(failed.phase).error, 'Failed to load feeds. Please try again.');
  assert.equal(shown(failed.phase).isCached, false);
  assert.equal(shown(failed.phase).items.length, 0);
});

test('surfaces the Request ID in the client-facing error after stream metadata arrives', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: null,
  });
  const withRequestId = applyFeedSetStreamChunk(started.phase, {
    type: 'meta',
    requestId: 'request-visible',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 0,
  });

  const failed = failFeedSetLifecycle(withRequestId.phase, {
    error: new Error('network failed'),
    now: new Date('2026-06-02T12:00:00.000Z'),
    fallbackSnapshot: null,
  });

  assert.equal(
    shown(failed.phase).error,
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
  const withItems = applyFeedSetStreamChunk(started.phase, {
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

  const done = applyFeedSetStreamChunk(withItems.phase, {
    type: 'done',
    requestId: 'request-3',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 1,
    totalItemCount: 1,
  });

  assert.equal(shown(done.phase).loading, false);
  assert.equal(shown(done.phase).completedFeeds, 0);
  assert.equal(shown(done.phase).totalFeeds, 0);
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

  const next = applyFeedSetApiResponse(started.phase, {
    cached: true,
    items: [serializedFeedItem({ title: 'Cached response' })],
    timeZone: 'UTC',
  });

  assert.equal(shown(next.phase).loading, false);
  assert.equal(shown(next.phase).isCached, true);
  assert.equal(shown(next.phase).completedFeeds, 0);
  assert.equal(shown(next.phase).totalFeeds, 0);
  assert.deepEqual(shown(next.phase).feedStatuses, [
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

  assert.deepEqual(shown(started.phase).items, []);
  assert.equal(shown(started.phase).loading, false);
  assert.equal(shown(started.phase).error, 'no-feeds');
  assert.equal(shown(started.phase).isCached, false);
  assert.equal(started.phase.kind, 'no-feeds');
  assert.equal(activityOf(started.phase, 2).title, 'No feeds enabled');
  assert.equal(activityOf(started.phase, 0).title, 'No feeds yet');
  assert.equal(shown(started.phase).enabledFeedCount, 0);
  assert.deepEqual(shown(started.phase).feedStatuses, []);
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

  assert.equal(started.phase.kind, 'loading');
  assert.equal(shown(started.phase).enabledFeedCount, 2);
  assert.equal(activityOf(started.phase, 3).type, 'loading');

  const completed = applyFeedSetApiResponse(started.phase, {
    cached: false,
    items: [],
    timeZone: 'UTC',
  });
  assert.equal(completed.phase.kind, 'ready');
  assert.equal(shown(completed.phase).enabledFeedCount, 2);
  assert.equal(activityOf(completed.phase, 3).title, 'All feeds checked');

  const failed = failFeedSetLifecycle(started.phase, {
    error: new Error('network failed'),
    fallbackSnapshot: null,
  });
  assert.equal(failed.phase.kind, 'failed');
  assert.equal(shown(failed.phase).enabledFeedCount, 2);
  assert.equal(activityOf(failed.phase, 3).title, 'Unable to load feeds');
});

test('finishes an ended stream without persisting when no done chunk arrived', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: null,
  });
  const withProgress = applyFeedSetStreamChunk(started.phase, {
    type: 'meta',
    requestId: 'request-4',
    cached: false,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 0,
  });

  const finished = finishFeedSetLifecycle(withProgress.phase);

  assert.equal(shown(finished.phase).loading, false);
  assert.equal(shown(finished.phase).completedFeeds, 0);
  assert.equal(shown(finished.phase).totalFeeds, 0);
  assert.deepEqual(finished.effects, []);
});

test('same-feed refresh keeps the current items and clears a fallback', () => {
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now: new Date('2026-06-02T12:00:00.000Z'),
    snapshot: null,
  });
  const fallback = failFeedSetLifecycle(started.phase, {
    error: new Error('offline'),
    now: new Date('2026-06-02T12:00:00.000Z'),
    fallbackSnapshot: {
      timeZone: 'UTC',
      dayKey: '2026-06-02',
      items: [serializedFeedItem({ title: 'Fallback' })],
    },
  });
  assert.equal(fallback.phase.kind, 'snapshot-fallback');
  const continued = continueFeedSetLifecycle(fallback.phase);
  assert.equal(continued.phase.kind, 'loading');
  if (continued.phase.kind !== 'loading') return;
  assert.equal(continued.phase.preview, 'snapshot');
  assert.equal(continued.phase.items[0].title, 'Fallback');
  assert.equal(activityOf(continued.phase, 1).title, 'Refreshing feeds');
});
