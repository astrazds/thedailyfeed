import test from 'node:test';
import assert from 'node:assert/strict';
import { feedActivityAnnouncement, activityOf } from '../lib/feed-load-activity';
import { beginFeedSetLifecycle, failFeedSetLifecycle } from '../lib/feed-set-lifecycle';
import { getDayKeyForTimeZone } from '../lib/date-utils';
import type { FeedItem } from '../lib/types';

const savedItem: FeedItem = {
  title: 'Saved note',
  link: 'https://example.com/saved',
  pubDate: new Date('2026-10-14T12:00:00.000Z'),
  source: 'Example',
};

function snapshotFallback(items: FeedItem[]) {
  const now = savedItem.pubDate;
  const started = beginFeedSetLifecycle({
    feeds: [{ url: 'https://example.com/feed.xml', name: 'Example' }],
    timeZone: 'UTC',
    now,
    snapshot: null,
  });
  const failed = failFeedSetLifecycle(started.phase, {
    error: new Error('offline'),
    now,
    fallbackSnapshot: {
      timeZone: 'UTC',
      dayKey: getDayKeyForTimeZone(now, 'UTC'),
      items: items.map((item) => ({ ...item, pubDate: item.pubDate.toISOString() })),
    },
  });
  return activityOf(failed.phase, 1);
}

test('an empty snapshot fallback asks the reader to try again', () => {
  const activity = snapshotFallback([]);
  assert.equal(activity.type, 'fallback');
  assert.equal(activity.title, 'Unable to refresh');
  assert.equal(activity.detail, 'Try again to check your feeds.');
  assert.equal(feedActivityAnnouncement(activity), 'Unable to refresh. Try again to check your feeds.');
});

test('a snapshot fallback with saved items names those items', () => {
  const activity = snapshotFallback([savedItem]);
  assert.equal(activity.type, 'fallback');
  assert.equal(activity.detail, 'Showing saved items from today.');
  assert.equal(feedActivityAnnouncement(activity), 'Unable to refresh. Showing saved items from today.');
});
