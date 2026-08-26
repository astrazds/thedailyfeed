import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DisclosureButton } from '../components/expandable-content';
import { FatalFallback } from '../components/error-boundary';
import {
  FeedManagerModal,
  getFeedManagerPendingState,
  getFeedManagerSubmitTone,
} from '../components/feed-manager-modal';
import { OfflineIndicator } from '../components/offline-indicator';

const noOp = () => undefined;
const asyncNoOp = async () => undefined;

test('feed manager dialog has a definite safe-area-aware viewport block size', () => {
  const globalStyles = readFileSync(
    new URL('../app/globals.css', import.meta.url),
    'utf8'
  );
  const dialogRule = globalStyles.match(/\.feed-manager-dialog\s*\{([\s\S]*?)\}/);

  assert.ok(dialogRule);
  assert.match(
    dialogRule[1],
    /(?:^|\n)\s*block-size:\s*calc\(100dvh - 2rem - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)/
  );
  assert.match(
    dialogRule[1],
    /(?:^|\n)\s*max-block-size:\s*calc\(100dvh - 2rem - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)/
  );
});

test('feed manager uses a native labelled dialog and real labelled forms', () => {
  const markup = renderToStaticMarkup(
    React.createElement(FeedManagerModal, {
      feeds: [],
      isOpen: true,
      isRefreshing: false,
      onRefreshFeeds: asyncNoOp,
      onFeedsChange: noOp,
      onClose: noOp,
    })
  );

  assert.match(markup, /^<dialog/);
  assert.match(markup, /aria-labelledby="feed-manager-title"/);
  assert.doesNotMatch(markup, /aria-modal=/);
  assert.match(markup, /<label[^>]+for="new-feed-name"[^>]*>Feed name/);
  assert.match(markup, /id="new-feed-name"[^>]+required=""/);
  assert.match(markup, /aria-describedby="new-feed-name-error"/);
  assert.match(markup, /<label[^>]+for="new-feed-url"[^>]*>Feed URL/);
  assert.match(markup, /id="new-feed-url"[^>]+required=""/);
  assert.match(markup, /placeholder="https:\/\/example\.com\/feed\.xml"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, />Add feed<\/button>/);
  assert.match(markup, />Manage feeds</);
  assert.doesNotMatch(markup, />Manage Feeds</);
  assert.doesNotMatch(markup, /\.\.\./);
});

test('feed manager prioritizes subscription workflows before the feed inventory', () => {
  const populatedMarkup = renderToStaticMarkup(
    React.createElement(FeedManagerModal, {
      feeds: [
        {
          id: 'long-name',
          name: 'ExtremelyLongUnbrokenFeedNameDesignedToStressTheNarrowMobileManagementPanel',
          url: 'https://example.com/rss.xml',
          enabled: true,
          addedAt: new Date('2026-08-26T00:00:00.000Z'),
        },
      ],
      isOpen: true,
      isRefreshing: false,
      onRefreshFeeds: asyncNoOp,
      onFeedsChange: noOp,
      onClose: noOp,
    })
  );

  const feedListPosition = populatedMarkup.indexOf('id="feed-list-title"');
  const addDisclosurePosition = populatedMarkup.indexOf('>Add feed</summary>');
  const transferDisclosurePosition = populatedMarkup.indexOf('>Import and export</summary>');

  assert.ok(feedListPosition >= 0);
  assert.ok(addDisclosurePosition < transferDisclosurePosition);
  assert.ok(transferDisclosurePosition < feedListPosition);
  assert.match(populatedMarkup, /<details[^>]*><summary[^>]*>Add feed<\/summary>/);
  assert.match(populatedMarkup, /<details[^>]*><summary[^>]*>Import and export<\/summary>/);
  assert.match(populatedMarkup, /class="[^"]*flex-1 min-w-0 w-full sm:w-auto[^"]*"/);
  assert.match(populatedMarkup, /<h4 class="[^"]*min-w-0[^"]*wrap-anywhere[^"]*"/);

  const emptyMarkup = renderToStaticMarkup(
    React.createElement(FeedManagerModal, {
      feeds: [],
      isOpen: true,
      isRefreshing: false,
      onRefreshFeeds: asyncNoOp,
      onFeedsChange: noOp,
      onClose: noOp,
    })
  );

  assert.match(emptyMarkup, /<details[^>]*open=""[^>]*><summary[^>]*>Add feed<\/summary>/);
});

test('only the validating add or edit form becomes busy and read-only', () => {
  assert.deepEqual(getFeedManagerPendingState({ type: 'add' }, null), {
    addPending: true,
    editPending: false,
  });
  assert.deepEqual(
    getFeedManagerPendingState({ type: 'edit', feedId: 'feed-1' }, 'feed-1'),
    { addPending: false, editPending: true }
  );
  assert.deepEqual(
    getFeedManagerPendingState({ type: 'edit', feedId: 'feed-2' }, 'feed-1'),
    { addPending: false, editPending: false }
  );
});

test('offline announcements keep a stable polite region mounted', () => {
  const markup = renderToStaticMarkup(React.createElement(OfflineIndicator));

  assert.match(markup, /role="status"/);
  assert.match(markup, /class="sr-only"/);
  assert.doesNotMatch(markup, /offline-indicator/);
});

test('feed manager moves primary emphasis from Add feed to Save changes while editing', () => {
  assert.equal(getFeedManagerSubmitTone('add', false), 'primary-action');
  assert.equal(getFeedManagerSubmitTone('add', true), 'neutral-action');
  assert.equal(getFeedManagerSubmitTone('save', true), 'primary-action');
});

test('article disclosure exposes its expanded state and controlled region', () => {
  const markup = renderToStaticMarkup(
    React.createElement(DisclosureButton, {
      controlsId: 'article-content-1',
      isExpanded: false,
      onToggle: noOp,
    })
  );

  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-controls="article-content-1"/);
  assert.match(markup, />Continue reading</);
});

test('fatal fallback exposes the main landmark, page heading, and recovery action', () => {
  const markup = renderToStaticMarkup(React.createElement(FatalFallback));

  assert.match(markup, /^<main/);
  assert.match(markup, /<h1[^>]*>Unable to load The Daily Feed<\/h1>/);
  assert.match(markup, /Reload the page to continue/);
  assert.match(markup, />Reload page<\/button>/);
});
