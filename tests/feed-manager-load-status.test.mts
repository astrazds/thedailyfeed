import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FeedManagerModal } from '../components/feed-manager-modal';

const noOp = () => undefined;
const asyncNoOp = async () => undefined;

function renderEmptyFeedManager(): string {
  return renderToStaticMarkup(
    createElement(FeedManagerModal, {
      feeds: [],
      isOpen: true,
      activity: { type: 'empty', title: 'No feeds yet', detail: '' },
      onRefreshFeeds: asyncNoOp,
      onFeedsChange: noOp,
      onClose: noOp,
    })
  );
}

test('feed manager keeps mobile height for feed tasks instead of duplicate footer chrome', () => {
  const markup = renderEmptyFeedManager();

  assert.doesNotMatch(markup, /Version \d+\.\d+\.\d+/);
  assert.doesNotMatch(markup, />Done<\/button>/);
  assert.match(markup, /aria-label="Close feed manager"/);
});

test('feed manager shows a semantic success tick beside a successfully loaded feed title', () => {
  const markup = renderToStaticMarkup(
    createElement(FeedManagerModal, {
      feeds: [
        {
          id: 'feed-1',
          name: 'Example Feed',
          url: 'https://example.com/rss.xml',
          enabled: true,
          addedAt: new Date('2026-07-14T00:00:00.000Z'),
        },
      ],
      feedStatuses: [
        {
          feedUrl: 'https://example.com/rss.xml',
          feedName: 'Example Feed',
          status: 'success',
          itemCount: 3,
        },
      ],
      isOpen: true,
      activity: { type: 'empty', title: 'No feeds yet', detail: '' },
      onRefreshFeeds: asyncNoOp,
      onFeedsChange: () => undefined,
      onClose: () => undefined,
    })
  );

  assert.match(
    markup,
    /Example Feed<\/h4><svg(?=[^>]+aria-label="Loaded successfully")(?=[^>]+style="color:var\(--status-success\)")/
  );
});

test('feed manager shows a semantic error cross beside a feed that failed to load', () => {
  const markup = renderToStaticMarkup(
    createElement(FeedManagerModal, {
      feeds: [
        {
          id: 'feed-1',
          name: 'Broken Feed',
          url: 'https://example.com/broken.xml',
          enabled: true,
          addedAt: new Date('2026-07-14T00:00:00.000Z'),
        },
      ],
      feedStatuses: [
        {
          feedUrl: 'https://example.com/broken.xml',
          feedName: 'Broken Feed',
          status: 'error',
          itemCount: 0,
        },
      ],
      isOpen: true,
      activity: { type: 'partial', title: 'Some feeds could not load', detail: '1 feed did not load.' },
      onRefreshFeeds: asyncNoOp,
      onFeedsChange: () => undefined,
      onClose: () => undefined,
    })
  );

  assert.match(markup, /Broken Feed<\/h4>[\s\S]*Failed to load/);
  assert.match(
    markup,
    /Some feeds could not load/
  );
  assert.match(markup, />Try all feeds again<\/button>/);
  assert.match(markup, /id="feed-list-title"[^>]+tabindex="-1"/);
});

test('feed manager distinguishes timed out feeds from other failures', () => {
  const markup = renderToStaticMarkup(
    createElement(FeedManagerModal, {
      feeds: [
        {
          id: 'feed-1',
          name: 'Slow Feed',
          url: 'https://example.com/slow.xml',
          enabled: true,
          addedAt: new Date('2026-07-14T00:00:00.000Z'),
        },
      ],
      feedStatuses: [
        {
          feedUrl: 'https://example.com/slow.xml',
          feedName: 'Slow Feed',
          status: 'timeout',
          itemCount: 0,
        },
      ],
      isOpen: true,
      activity: { type: 'loading', title: 'Loading feeds', detail: '0 of 1 feeds checked', completed: 0, total: 1 },
      onRefreshFeeds: asyncNoOp,
      onFeedsChange: noOp,
      onClose: noOp,
    })
  );

  assert.match(markup, /Slow Feed<\/h4>[\s\S]*Timed out/);
  assert.match(markup, />Refreshing feeds…<\/button>/);
});

test('feed manager marks unfinished feeds without marking disabled or unrequested feeds as successful', () => {
  const markup = renderToStaticMarkup(
    createElement(FeedManagerModal, {
      feeds: [
        {
          id: 'disabled',
          name: 'Disabled Feed',
          url: 'https://example.com/disabled.xml',
          enabled: false,
          addedAt: new Date('2026-07-14T00:00:00.000Z'),
        },
        {
          id: 'pending',
          name: 'Pending Feed',
          url: 'https://example.com/pending.xml',
          enabled: true,
          addedAt: new Date('2026-07-14T00:00:00.000Z'),
        },
        {
          id: 'unrequested',
          name: 'Unrequested Feed',
          url: 'https://example.com/unrequested.xml',
          enabled: true,
          addedAt: new Date('2026-07-14T00:00:00.000Z'),
        },
      ],
      feedStatuses: [
        {
          feedUrl: 'https://example.com/disabled.xml',
          feedName: 'Disabled Feed',
          status: 'success',
          itemCount: 3,
        },
        {
          feedUrl: 'https://example.com/pending.xml',
          feedName: 'Pending Feed',
          status: 'pending',
          itemCount: 0,
        },
      ],
      isOpen: true,
      activity: { type: 'empty', title: 'No feeds yet', detail: '' },
      onRefreshFeeds: asyncNoOp,
      onFeedsChange: () => undefined,
      onClose: () => undefined,
    })
  );

  assert.doesNotMatch(markup, /aria-label="(?:Loaded successfully|Failed to load)"/);
  assert.match(markup, /Not checked/);
  assert.doesNotMatch(markup, />Checking</);
});
