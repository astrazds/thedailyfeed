import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DisclosureButton } from '../components/expandable-content';
import { FatalFallback } from '../components/error-boundary';
import {
  FeedManagerModal,
  getFeedManagerSubmitTone,
} from '../components/feed-manager-modal';

const noOp = () => undefined;

test('feed manager uses a native labelled dialog and real labelled forms', () => {
  const markup = renderToStaticMarkup(
    React.createElement(FeedManagerModal, {
      feeds: [],
      isOpen: true,
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
