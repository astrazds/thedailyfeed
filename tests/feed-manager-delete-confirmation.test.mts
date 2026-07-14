import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FeedDeleteActions,
  focusDeleteCancelAction,
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

interface ActionButtonProps {
  onClick: () => void;
  ref?: typeof focusDeleteCancelAction;
}

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

test('confirmation controls attach focus, cancel, and confirm behavior to their buttons', () => {
  const calls: string[] = [];
  const actions = FeedDeleteActions({
    feed: exampleFeed,
    isConfirming: true,
    onCancel: () => calls.push('cancel'),
    onConfirm: () => calls.push('confirm'),
    onDeleteRequest: noOp,
    onEdit: noOp,
    onToggle: noOp,
  });
  const buttons = React.Children.toArray(actions.props.children) as React.ReactElement<ActionButtonProps>[];

  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].props.ref, focusDeleteCancelAction);

  buttons[0].props.onClick();
  buttons[1].props.onClick();

  assert.deepEqual(calls, ['cancel', 'confirm']);
});
