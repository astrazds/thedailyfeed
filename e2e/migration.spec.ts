import { test, expect, subscriptions } from './fixtures';
import type { Page } from '@playwright/test';

async function manager(page: Page) {
  await page.getByRole('button', { name: 'Manage feeds', exact: true }).last().click();
  return page.getByRole('dialog');
}
async function installOffer(page: Page) {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(event);
  });
}

test('legacy subscriptions preserve ids, dates, disabled sources and renamed sources through reload', async ({ page }) => {
  const inventory = [{ ...subscriptions[0], name: 'My renamed journal', addedAt: '2024-01-02T03:04:05.000Z' }, { ...subscriptions[1], enabled: false }];
  await page.addInitScript(inventory => localStorage.setItem('rss-feeds', JSON.stringify(inventory)), inventory);
  const requests: string[][] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/feeds') requests.push(request.postDataJSON().feedUrls); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  const dialog = await manager(page);
  await expect(dialog.getByRole('heading', { name: 'My renamed journal', exact: true })).toBeVisible();
  await expect(dialog.getByTestId('feed-row-small-hours').getByRole('button', { name: 'Enable', exact: true })).toBeVisible();
  expect(requests).toEqual([[subscriptions[0].url]]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rss-feeds')!))).toEqual(inventory);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rss-feeds')!))).toEqual(inventory);
});

test('an intentionally empty profile remains empty and offers add sources', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rss-feeds', '[]'));
  let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/feeds') requests++; });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No feeds yet', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh feeds', exact: true })).toBeDisabled();
  const dialog = await manager(page);
  await expect(dialog.getByRole('heading', { name: 'Feeds (0)', exact: true })).toBeVisible();
  expect(requests).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('rss-feeds'))).toBe('[]');
});

test('subscription changes in another tab refresh the reader without snapshot-triggered requests', async ({ page, context }) => {
  const requests: string[][] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/feeds') requests.push(request.postDataJSON().feedUrls); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(feed => localStorage.setItem('rss-feeds', JSON.stringify([feed])), subscriptions[1]);
  await expect(page.getByRole('heading', { name: 'Making things that last' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toHaveCount(0);
  expect(requests).toEqual([subscriptions.map(feed => feed.url), [subscriptions[1].url]]);
  await other.evaluate(() => {
    localStorage.setItem('pwa-install-dismissed', String(Date.now()));
    localStorage.setItem('rss-offline-feed-snapshots-v1', '[]');
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(requests).toHaveLength(2);
  const dialog = await manager(page);
  await expect(dialog.getByRole('heading', { name: 'Feeds (1)', exact: true })).toBeVisible();
  await other.close();
});

test('renaming a source retains reader content without fetching or periodic refresh', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-08T12:00:00Z') });
  const requests: string[][] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/feeds') requests.push(request.postDataJSON().feedUrls); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  const dialog = await manager(page);
  await dialog.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const edit = dialog.getByRole('form', { name: 'Edit Field Notes' });
  await edit.getByLabel('Feed name', { exact: true }).fill('My daily reading');
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'My daily reading', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close feed manager' }).click();
  await page.clock.fastForward(3_600_001);
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  expect(requests).toEqual([subscriptions.map(feed => feed.url)]);
});

test('validation rereads subscriptions changed by another tab before saving', async ({ page, context }) => {
  let release: (() => void) | undefined;
  await page.route('**/api/feeds/validate', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { valid: true } });
  });
  await page.goto('/');
  const dialog = await manager(page);
  await dialog.getByText('Add feed', { exact: true }).first().click();
  await dialog.getByLabel('Feed name', { exact: true }).fill('Pending source');
  await dialog.getByLabel('Feed URL', { exact: true }).fill('https://pending.example/rss');
  await dialog.getByRole('button', { name: 'Add feed', exact: true }).click();
  await expect.poll(() => release !== undefined).toBe(true);
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(() => {
    const feeds = JSON.parse(localStorage.getItem('rss-feeds')!);
    feeds[0].name = 'Concurrent rename';
    feeds[1].enabled = false;
    localStorage.setItem('rss-feeds', JSON.stringify(feeds));
  });
  release!();
  await expect(dialog.getByRole('heading', { name: 'Feeds (4)', exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Concurrent rename', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rss-feeds')!).map((feed: { name: string; enabled: boolean }) => [feed.name, feed.enabled]))).toEqual([
    ['Concurrent rename', true], ['Small Hours', false], ['Open Workshop', true], ['Pending source', true],
  ]);
  await other.close();
});

test('reader exposes heading, safe title links and disclosure relationships', async ({ page }) => {
  const long = '<p>' + 'A longer article remains accessible. '.repeat(30) + '</p>';
  await page.route('**/api/feeds?*', route => route.fulfill({ json: { cached: true, items: [
    { title: 'Safe title', source: 'Synthetic', link: 'https://articles.example/safe', pubDate: '2026-09-08T11:00:00Z', contentHtml: long },
    { title: 'Unsafe title', source: 'Synthetic', link: 'javascript:alert(1)', pubDate: '2026-09-08T10:00:00Z', contentHtml: '<p>Still readable.</p>' },
  ] } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The Daily Feed', exact: true, level: 1 })).toBeVisible();
  const link = page.getByRole('link', { name: 'Safe title', exact: true });
  await expect(link).toHaveAttribute('href', 'https://articles.example/safe');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(page.getByRole('banner')).toContainText('Tuesday, September 8, 2026 · 2 items');
  await expect(page.getByRole('banner').getByText('Cached', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unsafe title', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Unsafe title', exact: true })).toHaveCount(0);
  const expand = page.getByRole('button', { name: 'Continue reading Safe title', exact: true });
  const id = await expand.getAttribute('aria-controls');
  expect(id).not.toBeNull();
  await expect(page.locator(`[id="${id}"]`)).toBeVisible();
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expand.click();
  await expect(page.getByRole('button', { name: 'Show less Safe title', exact: true })).toHaveAttribute('aria-expanded', 'true');
});

test('offline banner changes to a temporary online confirmation', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-08T12:00:00Z') });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('status').filter({ hasText: 'You are offline.' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('status').filter({ hasText: 'Back online' })).toBeVisible();
  await page.clock.fastForward(3001);
  await expect(page.getByText('Back online', { exact: true })).toHaveCount(0);
});

test('install dismissal survives reload for seven days and expires', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-08T12:00:00Z') });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  await installOffer(page);
  await expect(page.getByRole('complementary', { name: 'Install The Daily Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  expect(await page.evaluate(() => new Date(Number(localStorage.getItem('pwa-install-dismissed'))).toISOString().slice(0, 10))).toBe('2026-09-08');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  await installOffer(page);
  await expect(page.getByRole('complementary', { name: 'Install The Daily Feed' })).toHaveCount(0);
  await page.clock.setSystemTime(new Date('2026-09-16T12:00:00Z'));
  await installOffer(page);
  await expect(page.getByRole('complementary', { name: 'Install The Daily Feed' })).toBeVisible();
});

test('install dismissal remains usable when storage is full', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'pwa-install-dismissed') throw new DOMException('Full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await installOffer(page);
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Install The Daily Feed' })).toHaveCount(0);
  await installOffer(page);
  await expect(page.getByRole('complementary', { name: 'Install The Daily Feed' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  expect(errors).toEqual([]);
});


test('legacy snapshots retain separate feed sets while rejecting other timezones', async ({ page }) => {
  const item = { title: 'Saved from my first feed set', source: 'Field Notes', link: 'https://articles.example/saved', pubDate: '2026-09-08T11:00:00Z', contentHtml: '<p>Available without a successful request.</p>' };
  const otherItem = { ...item, title: 'Saved from my second feed set' };
  await page.addInitScript(({ feeds, item, otherItem }) => {
    localStorage.setItem('rss-feeds', JSON.stringify([feeds[0]]));
    localStorage.setItem('rss-offline-feed-snapshots-v1', JSON.stringify([
      { cacheKey: `${feeds[0].url}::UTC`, timeZone: 'UTC', dayKey: '2026-09-08', savedAt: '2026-09-08T11:30:00Z', items: [item] },
      { cacheKey: `${feeds[1].url}::UTC`, timeZone: 'UTC', dayKey: '2026-09-08', savedAt: '2026-09-08T11:30:00Z', items: [otherItem] },
    ]));
  }, { feeds: subscriptions, item, otherItem });
  await page.route('**/api/feeds?*', route => route.fulfill({ status: 503, json: { error: 'Offline fixture' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: item.title, exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Unable to refresh. Showing saved items from today.');
  await page.evaluate(feed => {
    localStorage.setItem('rss-feeds', JSON.stringify([feed]));
    window.dispatchEvent(new Event('feedsUpdated'));
  }, subscriptions[1]);
  await expect(page.getByRole('heading', { name: otherItem.title, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: item.title, exact: true })).toHaveCount(0);
  await page.evaluate(feed => {
    localStorage.setItem('rss-feeds', JSON.stringify([feed]));
    window.dispatchEvent(new Event('feedsUpdated'));
  }, subscriptions[0]);
  await expect(page.getByRole('heading', { name: item.title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rss-offline-feed-snapshots-v1')!).length)).toBe(2);
  await page.evaluate(() => {
    const snapshots = JSON.parse(localStorage.getItem('rss-offline-feed-snapshots-v1')!);
    snapshots[0].timeZone = 'America/New_York';
    snapshots[0].cacheKey = snapshots[0].cacheKey.replace('::UTC', '::America/New_York');
    localStorage.setItem('rss-offline-feed-snapshots-v1', JSON.stringify(snapshots));
    window.dispatchEvent(new Event('feedsUpdated'));
  });
  await page.getByRole('button', { name: 'Refresh feeds', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unable to load feeds', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: item.title, exact: true })).toHaveCount(0);
});

test('pending add validation preserves a concurrent toggle in the same manager', async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route('**/api/feeds/validate', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { valid: true } });
  });
  await page.goto('/');
  const dialog = await manager(page);
  await dialog.getByRole('button', { name: 'Add feed options', exact: true }).click();
  await dialog.getByLabel('Feed name', { exact: true }).fill('Pending source');
  await dialog.getByLabel('Feed URL', { exact: true }).fill('https://pending.example/rss');
  await dialog.getByRole('button', { name: 'Add feed', exact: true }).click();
  await expect.poll(() => release !== undefined).toBe(true);
  await dialog.getByTestId('feed-row-field-notes').getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(dialog.getByTestId('feed-row-field-notes').getByRole('button', { name: 'Enable', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add feed…', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Feed name', { exact: true })).toHaveAttribute('readonly', '');
  release!();
  await expect(dialog.getByRole('heading', { name: 'Feeds (4)', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rss-feeds')!).map((feed: { name: string; enabled: boolean }) => [feed.name, feed.enabled]))).toEqual([
    ['Field Notes', false], ['Small Hours', true], ['Open Workshop', true], ['Pending source', true],
  ]);
});

test('font failure exposes a labelled recovery screen and reload restores the reader', async ({ page }) => {
  await page.route('**/*.ttf', route => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Unable to load The Daily Feed', level: 1, exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('The reader font could not load.');
  await page.unroute('**/*.ttf');
  await page.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
});

test('a successful empty response stays distinct from failure and its manager fits the viewport', async ({ page }) => {
  await page.route('**/api/feeds?*', route => route.fulfill({ json: { cached: false, items: [] } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No new items today', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Your enabled feeds have no items dated today.');
  await expect(page.getByRole('button', { name: 'Refresh feeds', exact: true })).toBeEnabled();
  const dialog = await manager(page);
  await expect(dialog).toHaveAccessibleName('Manage feeds');
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  await expect(dialog.getByRole('button', { name: 'Add feed options', exact: true })).toHaveAttribute('aria-expanded', 'false');
  const name = dialog.getByRole('button', { name: 'Add feed options', exact: true });
  const transfer = dialog.getByRole('button', { name: 'Import and export options', exact: true });
  expect((await name.boundingBox())!.y).toBeLessThan((await transfer.boundingBox())!.y);
  expect((await transfer.boundingBox())!.y).toBeLessThan((await dialog.getByRole('heading', { name: 'Feeds (3)', exact: true }).boundingBox())!.y);
});
