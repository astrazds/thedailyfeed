import { test, expect, subscriptions } from './fixtures';
import type { FeedStreamChunk } from '../lib/types';

declare global {
  interface Window {
    feedLoadingTest: {
      requests: number;
      send: (chunks: FeedStreamChunk[]) => void;
      finish: () => void;
      fail: () => void;
    };
  }
}

async function controlFeedResponses(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    let active: ReadableStreamDefaultController<Uint8Array> | null = null;
    const encoder = new TextEncoder();
    window.feedLoadingTest = {
      requests: 0,
      send(chunks) {
        if (!active) throw new Error('No active feed response');
        active.enqueue(encoder.encode(chunks.map(chunk => JSON.stringify(chunk)).join('\n') + '\n'));
      },
      finish() { active?.close(); active = null; },
      fail() { active?.error(new Error('Synthetic connection failure')); active = null; },
    };
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname !== '/api/feeds') return originalFetch(input, init);
      window.feedLoadingTest.requests += 1;
      const body = new ReadableStream<Uint8Array>({ start(controller) { active = controller; } });
      return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } });
    };
  });
}

const common = { requestId: 'loading-proof', cached: false, timeZone: 'UTC', totalFeeds: 3 };
const metadata: FeedStreamChunk = { ...common, type: 'meta', completedFeeds: 0 };
const firstResult: FeedStreamChunk = {
  ...common, type: 'feed_result', completedFeeds: 1,
  feedUrl: subscriptions[0].url, status: 'success', itemCount: 1,
  items: [{ title: 'A story while other feeds load', link: 'https://articles.example/loading',
    source: 'Field Notes', pubDate: '2026-09-08T11:00:00Z', contentHtml: '<p>This article is ready to read.</p>' }],
};
const remaining: FeedStreamChunk[] = subscriptions.slice(1).map((feed, index) => ({
  ...common, type: 'feed_result', completedFeeds: index + 2, feedUrl: feed.url,
  status: 'success', itemCount: 0, items: [],
}));
const done: FeedStreamChunk = { ...common, type: 'done', completedFeeds: 3, totalItemCount: 1 };

async function send(page: import('@playwright/test').Page, chunks: FeedStreamChunk[]) {
  await page.evaluate(chunks => window.feedLoadingTest.send(chunks), chunks);
}

async function capture(page: import('@playwright/test').Page, project: string, state: string) {
  if (process.env.LOADING_CAPTURE_DIR) {
    await page.screenshot({ path: `${process.env.LOADING_CAPTURE_DIR}/${project}-${state}.png`, fullPage: false, animations: 'disabled' });
  }
}

test('loading remains visible through initial response, partial articles, and refresh', async ({ page }, info) => {
  await controlFeedResponses(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(1);
  await send(page, [metadata]);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('banner').getByText('Loading feeds', { exact: true })).toBeVisible();
  const progress = page.getByRole('progressbar', { name: 'Feed loading progress' });
  await expect(progress).toHaveAttribute('max', '3');
  await expect(progress).toHaveAttribute('value', '0');
  await expect(page.getByRole('button', { name: 'Refresh feeds', exact: true })).toBeDisabled();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.getByRole('banner').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(145);
  expect(await progress.evaluate(element => element.getBoundingClientRect().height)).toBe(2);
  const refreshBounds = await page.getByRole('button', { name: 'Refresh feeds', exact: true }).boundingBox();
  const managerBounds = await page.getByRole('button', { name: 'Manage feeds', exact: true }).last().boundingBox();
  expect(refreshBounds).not.toBeNull();
  expect(managerBounds).not.toBeNull();
  if (refreshBounds && managerBounds) {
    expect(refreshBounds.width).toBeGreaterThanOrEqual(44);
    expect(refreshBounds.height).toBeGreaterThanOrEqual(44);
    const overlap = refreshBounds.x < managerBounds.x + managerBounds.width &&
      refreshBounds.x + refreshBounds.width > managerBounds.x &&
      refreshBounds.y < managerBounds.y + managerBounds.height &&
      refreshBounds.y + refreshBounds.height > managerBounds.y;
    expect(overlap).toBe(false);
  }
  await capture(page, info.project.name, 'initial');
  await send(page, [firstResult]);
  await expect(page.getByRole('heading', { name: 'A story while other feeds load' })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');
  await expect(progress).toHaveAttribute('value', '1');
  await expect(page.getByRole('banner').getByText('1 of 3 feeds checked', { exact: true })).toBeVisible();
  await expect(page.locator('main article')).toHaveCount(1);
  await capture(page, info.project.name, 'partial');
  await page.getByRole('button', { name: 'Manage feeds', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('progressbar', { name: 'Feed loading progress' })).toHaveAttribute('value', '1');
  await expect(page.getByRole('dialog').getByText('Checking', { exact: true })).toHaveCount(2);
  await capture(page, info.project.name, 'manager-pending');
  await page.getByRole('button', { name: 'Close feed manager' }).click();
  await send(page, [...remaining, done]);
  await page.evaluate(() => window.feedLoadingTest.finish());
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await expect(progress).toHaveCount(0);
  await capture(page, info.project.name, 'complete');
  const refresh = page.getByRole('button', { name: 'Refresh feeds', exact: true });
  await refresh.click();
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(2);
  await expect(page.getByRole('banner').getByText('Refreshing feeds', { exact: true })).toBeVisible();
  await expect(refresh).toBeDisabled();
  await refresh.press('Enter');
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(2);
  await expect(page.getByRole('heading', { name: 'A story while other feeds load' })).toBeVisible();
  await capture(page, info.project.name, 'refresh');
  await send(page, [metadata, firstResult, ...remaining, done]);
  await page.evaluate(() => window.feedLoadingTest.finish());
  await expect(refresh).toBeEnabled();
  await expect(refresh).toBeFocused();
  await expect(progress).toHaveCount(0);
});

test('a failed refresh does not announce successful completion in the manager', async ({ page }, info) => {
  await controlFeedResponses(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(1);
  const failures: FeedStreamChunk[] = subscriptions.map((feed, index) => ({
    ...common, type: 'feed_result', completedFeeds: index + 1,
    feedUrl: feed.url, status: 'error', itemCount: 0, items: [],
  }));
  await send(page, [metadata, ...failures, { ...done, totalItemCount: 0 }]);
  await page.evaluate(() => window.feedLoadingTest.finish());
  await expect(page.getByRole('heading', { name: 'No articles loaded' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No new items today' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage feeds', exact: true }).last().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Try all feeds again', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(2);
  await page.evaluate(() => window.feedLoadingTest.fail());
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await expect(dialog.getByText('Feed refresh complete.', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('status', { name: 'Feed activity', exact: true }).filter({ hasText: /unable|failed|interrupted/i })).toHaveCount(1);
  await expect(dialog.getByRole('heading', { name: 'Feeds (3)', exact: true })).toBeFocused();
  await capture(page, info.project.name, 'manager-retry-failed');
  await expect(dialog.getByText('Checking', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close feed manager' }).click();
  await expect(page.getByRole('heading', { name: 'No new items today' })).toHaveCount(0);
});


test('saved articles remain readable when a refresh fails', async ({ page }, info) => {
  await controlFeedResponses(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(1);
  await send(page, [metadata, firstResult, ...remaining, done]);
  await page.evaluate(() => window.feedLoadingTest.finish());
  await page.getByRole('button', { name: 'Refresh feeds', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(2);
  await page.getByRole('button', { name: 'Manage feeds', exact: true }).last().click();
  await page.evaluate(() => window.feedLoadingTest.fail());
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('status', { name: 'Feed activity', exact: true }).filter({ hasText: /saved items/i })).toHaveCount(1);
  await expect(dialog.getByText('Checking', { exact: true })).toHaveCount(0);
  await capture(page, info.project.name, 'manager-failed');
  await page.getByRole('button', { name: 'Close feed manager' }).click();
  await expect(page.getByRole('heading', { name: 'A story while other feeds load' })).toBeVisible();
  await expect(page.getByRole('main').getByText('Unable to refresh. Showing saved items from today.', { exact: true })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await capture(page, info.project.name, 'saved-fallback');
});

test('an interrupted stream ends progress and marks unfinished feeds', async ({ page }, info) => {
  await controlFeedResponses(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(1);
  await send(page, [metadata, firstResult]);
  await page.evaluate(() => window.feedLoadingTest.finish());
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'A story while other feeds load' })).toBeVisible();
  await page.getByRole('button', { name: 'Manage feeds', exact: true }).last().click();
  await expect(page.getByRole('dialog').getByText('Not checked', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('dialog').getByText('Checking', { exact: true })).toHaveCount(0);
  await capture(page, info.project.name, 'interrupted');
});

test('loading stays clear in dark mode with reduced motion', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await controlFeedResponses(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(1);
  await send(page, [metadata]);
  await expect(page.getByRole('banner').getByText('Loading feeds', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Feed loading progress' })).toBeVisible();
  const movingElements = await page.locator('main, header').evaluateAll(roots => roots.flatMap(root => [root, ...root.querySelectorAll('*')]).filter(element => {
    const style = getComputedStyle(element);
    return style.animationName !== 'none' && style.animationDuration.split(',').some(duration => parseFloat(duration) > 0.01);
  }).map(element => element.tagName));
  expect(movingElements).toEqual([]);
  await capture(page, info.project.name, 'dark-reduced-motion');
  await send(page, [firstResult, ...remaining, done]);
  await page.evaluate(() => window.feedLoadingTest.finish());
});


test('a completed response with failed sources stays visibly partial', async ({ page }, info) => {
  await controlFeedResponses(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(1);
  await send(page, [metadata, firstResult, ...remaining.map(chunk => ({ ...chunk, status: 'timeout' as const })), done]);
  await page.evaluate(() => window.feedLoadingTest.finish());
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'A story while other feeds load' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Feed activity', exact: true }).filter({ hasText: /2 feeds.*(did not|failed|unavailable|could not)|2 of 3.*(failed|unavailable)|could not.*2/i })).toHaveCount(1);
  await capture(page, info.project.name, 'partial-failure');
});

test('disabled sources do not leave loading visuals running', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Manage feeds', exact: true }).last().click();
  const dialog = page.getByRole('dialog');
  for (const feed of subscriptions) {
    const row = dialog.getByRole('heading', { name: feed.name, exact: true }).locator('../..').locator('..');
    await row.getByRole('button', { name: 'Disable', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Close feed manager' }).click();
  await expect(page.getByRole('heading', { name: 'No feeds enabled' })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh feeds', exact: true })).toBeDisabled();
});


test('a failed initial request offers a working reader retry', async ({ page }, info) => {
  await controlFeedResponses(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(1);
  await page.evaluate(() => window.feedLoadingTest.fail());
  await expect(page.getByRole('heading', { name: 'Unable to load feeds', exact: true })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await capture(page, info.project.name, 'initial-failure');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.feedLoadingTest.requests)).toBe(2);
  await expect(page.getByRole('banner').getByText('Loading feeds', { exact: true })).toBeVisible();
  await send(page, [metadata, firstResult, ...remaining, done]);
  await page.evaluate(() => window.feedLoadingTest.finish());
  await expect(page.getByRole('heading', { name: 'A story while other feeds load' })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
});
