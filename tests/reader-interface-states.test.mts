import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ReaderEmptyState,
  RefreshNotice,
  getReaderStatus,
} from '../components/feed-content';

const noOp = () => undefined;

function renderState(configuredFeedCount: number, enabledFeedCount: number): string {
  return renderToStaticMarkup(
    React.createElement(ReaderEmptyState, {
      configuredFeedCount,
      enabledFeedCount,
      onManageFeeds: noOp,
    })
  );
}

test('reader distinguishes no configured feeds from disabled feeds and no new items', () => {
  const noFeeds = renderState(0, 0);
  assert.match(noFeeds, /No feeds yet/);
  assert.match(noFeeds, /Add an RSS or Atom feed/);
  assert.match(noFeeds, />Manage feeds<\/button>/);

  const noEnabledFeeds = renderState(2, 0);
  assert.match(noEnabledFeeds, /No feeds enabled/);
  assert.match(noEnabledFeeds, /Enable at least one feed/);
  assert.match(noEnabledFeeds, />Manage feeds<\/button>/);

  const noNewItems = renderState(2, 2);
  assert.match(noNewItems, /No new items today/);
  assert.match(noNewItems, /enabled feeds have no items dated today/);
  assert.match(noNewItems, />Manage feeds<\/button>/);
});

test('snapshot fallback explains the stale refresh and offers the aggregate retry action', () => {
  const markup = renderToStaticMarkup(
    React.createElement(RefreshNotice, { onRefresh: async () => undefined })
  );

  assert.match(markup, /Unable to refresh\. Showing saved items from today\./);
  assert.match(markup, />Try again<\/button>/);
  assert.match(markup, /class="neutral-action/);
  assert.equal(
    getReaderStatus({
      loading: false,
      error: null,
      refreshNotice: 'snapshot-fallback',
      itemCount: 2,
      completedFeeds: 0,
      totalFeeds: 0,
    }),
    'Unable to refresh. Showing saved items from today. 2 items loaded.'
  );
});
