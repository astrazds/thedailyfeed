import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FeedDeleteActions,
  focusAfterUpdate,
  focusDeleteCancelAction,
  focusPendingTarget,
} from '../components/feed-delete-actions';
import type { Feed } from '../lib/feed-storage';

const exampleFeed: Feed = {
  id: 'feed-1',
  name: 'Example Feed',
  url: 'https://example.com/rss.xml',
  enabled: true,
  addedAt: new Date('2026-07-14T00:00:00.000Z'),
};

const noOp = () => undefined;

function renderDeleteActions(isConfirming: boolean): string {
  return renderToStaticMarkup(
    React.createElement(FeedDeleteActions, {
      feed: exampleFeed,
      isConfirming,
      onCancel: noOp,
      onConfirm: noOp,
      onDeleteRequest: noOp,
      onEdit: noOp,
      onToggle: noOp,
    })
  );
}

test('delete request starts with the regular feed actions', () => {
  const html = renderDeleteActions(false);

  assert.match(html, />Delete<\/button>/);
  assert.doesNotMatch(html, />Cancel<\/button>/);
  assert.doesNotMatch(html, /Confirm deletion/);
});

test('delete confirmation renders app-owned controls', () => {
  const html = renderDeleteActions(true);

  assert.match(html, /role="group"/);
  assert.match(html, /aria-label="Confirm deletion of Example Feed"/);
  assert.match(html, />Cancel<\/button>/);
  assert.match(html, /class="destructive-button [^"]+"/);
  assert.match(html, /aria-label="Delete “Example Feed”"[^>]*>Delete feed<\/button>/);
  assert.doesNotMatch(html, />Delete<\/button>/);
});

test('mounted delete cancellation action receives focus', () => {
  let focusCalls = 0;

  focusDeleteCancelAction({
    focus: () => {
      focusCalls += 1;
    },
  });
  focusDeleteCancelAction(null);

  assert.equal(focusCalls, 1);
});

test('focus restoration resolves its target after the state update', () => {
  let targetAvailable = false;
  let focusCalls = 0;

  focusAfterUpdate(
    () => targetAvailable ? { focus: () => { focusCalls += 1; } } : null,
    (callback) => {
      targetAvailable = true;
      callback();
    }
  );

  assert.equal(focusCalls, 1);
});

test('pending focus is applied once after the updated target commits', () => {
  const pending = { current: true };
  let focusCalls = 0;
  const target = { focus: () => { focusCalls += 1; } };

  focusPendingTarget(pending, target);
  focusPendingTarget(pending, target);

  assert.equal(focusCalls, 1);
  assert.equal(pending.current, false);
});
