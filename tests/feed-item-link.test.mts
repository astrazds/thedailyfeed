import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedItemComponent } from '../components/feed-item';
import type { FeedItem } from '../lib/rss';

function feedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: 'Unsafe link item',
    link: 'https://example.com/article',
    pubDate: new Date('2026-06-01T10:00:00.000Z'),
    source: 'Example',
    ...overrides,
  };
}

test('unsafe article links render as non-clickable text', () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedItemComponent, {
      item: feedItem({ link: 'javascript:alert(1)' }),
    })
  );

  assert.equal(html.includes('href='), false);
  assert.match(html, /Unsafe link item/);
});

test('http and https article links remain clickable', () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedItemComponent, {
      item: feedItem({ link: 'https://example.com/article' }),
    })
  );

  assert.match(html, /href="https:\/\/example\.com\/article"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
