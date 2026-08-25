import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedList } from '../components/feed-list';
import type { FeedItem } from '../lib/rss';

const item: FeedItem = {
  title: 'A loaded item',
  link: 'https://example.com/article',
  pubDate: new Date('2026-07-14T00:00:00.000Z'),
  source: 'Example Feed',
};

test('keeps the feed loading effect visible while more items are streaming', () => {
  const markup = renderToStaticMarkup(
    React.createElement(FeedList, { items: [item], loading: true })
  );

  assert.match(markup, /A loaded item/);
  assert.match(markup, /aria-hidden="true"/);
  assert.doesNotMatch(markup, /role="status"/);
});

test('removes the feed loading effect when streaming completes', () => {
  const markup = renderToStaticMarkup(
    React.createElement(FeedList, { items: [item], loading: false })
  );

  assert.doesNotMatch(markup, /animate-pulse/);
});
