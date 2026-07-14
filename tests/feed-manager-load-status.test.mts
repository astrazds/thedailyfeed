import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FeedManagerModal } from '../components/feed-manager-modal';

test('feed manager shows a green accessible tick beside a successfully loaded feed title', () => {
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
      onFeedsChange: () => undefined,
      onClose: () => undefined,
    })
  );

  assert.match(
    markup,
    /Example Feed<\/h4><svg(?=[^>]+aria-label="Loaded successfully")(?=[^>]+style="color:green")/
  );
});

test('feed manager shows a red accessible cross beside a feed that failed to load', () => {
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
      onFeedsChange: () => undefined,
      onClose: () => undefined,
    })
  );

  assert.match(
    markup,
    /Broken Feed<\/h4><svg(?=[^>]+aria-label="Failed to load")(?=[^>]+style="color:red")/
  );
});

test('feed manager leaves disabled, pending, and unrequested feeds unmarked', () => {
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
      onFeedsChange: () => undefined,
      onClose: () => undefined,
    })
  );

  assert.doesNotMatch(markup, /aria-label="(?:Loaded successfully|Failed to load)"/);
});
