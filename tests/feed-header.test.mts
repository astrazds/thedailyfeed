import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { FeedHeader } from '../components/feed-header.tsx';

function renderHeaderInTimeZone(timeZone: string): string {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = timeZone;

  try {
    return renderToStaticMarkup(React.createElement(FeedHeader, { itemCount: 0 }));
  } finally {
    if (previousTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTimeZone;
    }
  }
}

test('FeedHeader server markup starts with the same deterministic date label in every timezone', () => {
  const utcMarkup = renderHeaderInTimeZone('UTC');
  const melbourneMarkup = renderHeaderInTimeZone('Australia/Melbourne');

  assert.equal(utcMarkup, melbourneMarkup);
  assert.match(utcMarkup, />Today · 0 items</);
});
