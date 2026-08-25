import test from 'node:test';
import assert from 'node:assert/strict';
import type { Feed } from '../lib/feed-storage';
import type { FeedManagerOperationResult } from '../lib/feed-manager-operations';
import { mapFeedManagerResultToModalState } from '../components/feed-manager-modal-state';

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

test('modal adapter maps operation mutation facts to local reset and status state', () => {
  const addedFeed = feed();
  const addResult: FeedManagerOperationResult = {
    feeds: [addedFeed],
    mutation: {
      type: 'add',
      changedFeeds: [addedFeed],
      enabledFeedSetChanged: true,
    },
  };

  assert.deepEqual(mapFeedManagerResultToModalState(addResult), {
    feeds: [addedFeed],
    newFeedName: '',
    newFeedUrl: '',
  });

  const editedFeed = feed({ name: 'Renamed' });
  const editResult: FeedManagerOperationResult = {
    feeds: [editedFeed],
    mutation: {
      type: 'edit',
      changedFeeds: [editedFeed],
      enabledFeedSetChanged: false,
    },
  };

  assert.deepEqual(mapFeedManagerResultToModalState(editResult), {
    feeds: [editedFeed],
    editingId: null,
    editName: '',
    editUrl: '',
  });

  const importResult: FeedManagerOperationResult = {
    feeds: [addedFeed],
    mutation: {
      type: 'import-opml',
      changedFeeds: [addedFeed],
      enabledFeedSetChanged: true,
      importSummary: {
        added: 1,
        skippedDuplicate: 1,
        invalid: 2,
        overLimit: 0,
      },
    },
  };

  assert.deepEqual(mapFeedManagerResultToModalState(importResult), {
    feeds: [addedFeed],
    importStatus: 'Imported 1 feed, skipped 1 duplicate, 2 invalid',
  });
});
