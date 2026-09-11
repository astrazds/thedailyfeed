import { readFile } from 'node:fs/promises';
import { test, expect, subscriptions } from './fixtures';

async function openManager(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Manage feeds', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('reader renders synthetic stories without horizontal overflow', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.UPDATE_SCREENSHOTS === '1') {
    await page.screenshot({ path: `docs/assets/reader-${info.project.name}.png`, fullPage: true });
  }
  await openManager(page);
  await expect(page.getByRole('heading', { name: 'Feeds (3)', exact: true })).toBeVisible();
});

test('OPML export and import round-trip special attribute characters', async ({ page }) => {
  await page.goto('/');
  const special = { ...subscriptions[0], name: 'A "quoted" & <angled> publisher\'s feed', url: 'https://example.com/rss?q="news"&category=<tech>&owner=it\'s' };
  await page.evaluate(feed => {
    localStorage.setItem('rss-feeds', JSON.stringify([feed]));
    window.dispatchEvent(new Event('feedsUpdated'));
  }, special);
  await openManager(page);
  await page.getByText('Import and export', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export OPML', exact: true }).click();
  const download = await downloadPromise;
  const xml = await readFile((await download.path())!, 'utf8');
  const attributes = await page.evaluate(xml => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return { error: !!doc.querySelector('parsererror'), name: doc.querySelector('outline')?.getAttribute('title'), url: doc.querySelector('outline')?.getAttribute('xmlUrl') };
  }, xml);
  expect(attributes).toEqual({ error: false, name: special.name, url: special.url });
  await page.getByLabel('Choose OPML file').setInputFiles({ name: 'synthetic.opml', mimeType: 'text/xml', buffer: Buffer.from(xml) });
  await expect(page.getByRole('dialog').getByRole('status', { name: 'Subscription updates', exact: true })).toContainText('duplicate');
});

test('failed storage write retains form and recovers on retry', async ({ page }) => {
  await page.goto('/');
  await openManager(page);
  await page.getByText('Add feed', { exact: true }).first().click();
  await page.getByLabel('Feed name', { exact: true }).fill('A new source');
  await page.getByLabel('Feed URL', { exact: true }).fill('https://new.example/rss');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'rss-feeds') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    Object.assign(window, { restoreStorage: () => { Storage.prototype.setItem = original; } });
  });
  await page.getByRole('button', { name: 'Add feed', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('browser storage');
  await expect(page.getByLabel('Feed name', { exact: true })).toHaveValue('A new source');
  await expect(page.getByRole('heading', { name: 'Feeds (3)', exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreStorage(): void }).restoreStorage());
  await page.getByRole('button', { name: 'Add feed', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Feeds (4)', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
});

test('malicious article HTML cannot create executable elements or links', async ({ page }) => {
  await page.route('**/api/feeds?*', route => route.fulfill({ json: { cached: false, items: [{
    title: 'Untrusted article', source: 'Synthetic', link: 'https://example.com/article', pubDate: '2026-09-08T11:00:00Z',
    contentHtml: '<p>Safe text</p><script>window.pwned=true</script><img src="https://images.example/a.png" onerror="window.pwned=true"><a href="javascript:alert(1)">Unsafe link</a><iframe src="https://example.com"></iframe>',
  }] } }));
  await page.goto('/');
  await expect(page.getByText('Safe text', { exact: true })).toBeVisible();
  const article = page.locator('article');
  await expect(article.locator('script, iframe, [onerror], a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
});

for (const operation of ['edit', 'toggle', 'delete', 'import'] as const) {
  test(`failed ${operation} retains visible state and recovers on retry`, async ({ page }) => {
    await page.goto('/');
    await openManager(page);
    const dialog = page.getByRole('dialog');
    const before = await page.evaluate(() => localStorage.getItem('rss-feeds'));
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'rss-feeds') throw new DOMException('Full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      Object.assign(window, { restoreStorage: () => { Storage.prototype.setItem = original; } });
    });
    if (operation === 'edit') {
      await dialog.getByRole('button', { name: 'Edit', exact: true }).first().click();
      await dialog.getByRole('form', { name: 'Edit Field Notes' }).getByLabel('Feed name', { exact: true }).fill('Edited source');
    } else if (operation === 'delete') {
      await dialog.getByRole('button', { name: 'Delete', exact: true }).first().click();
    } else if (operation === 'import') {
      await dialog.getByText('Import and export', { exact: true }).click();
    }
    const perform = async () => {
      if (operation === 'import') {
        await dialog.getByLabel('Choose OPML file').setInputFiles({ name: 'synthetic.opml', mimeType: 'text/xml',
          buffer: Buffer.from('<opml version="2.0"><body><outline title="Imported source" xmlUrl="https://import.example/rss" /></body></opml>') });
      } else {
        const name = operation === 'edit' ? 'Save changes' : operation === 'toggle' ? 'Disable' : 'Delete “Field Notes”';
        await dialog.getByRole('button', { name, exact: true }).first().click();
      }
    };
    await perform();
    await expect(dialog.getByRole('alert')).toContainText('browser storage');
    expect(await page.evaluate(() => localStorage.getItem('rss-feeds'))).toBe(before);
    await expect(dialog.getByRole('status', { name: 'Subscription updates', exact: true })).not.toContainText(/saved|added|Imported/);
    if (operation === 'edit') await expect(dialog.getByRole('form', { name: 'Edit Field Notes' }).getByLabel('Feed name', { exact: true })).toHaveValue('Edited source');
    if (operation === 'delete') await expect(dialog.getByRole('group', { name: 'Confirm deletion of Field Notes' })).toBeVisible();
    await page.evaluate(() => (window as unknown as { restoreStorage(): void }).restoreStorage());
    await perform();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('rss-feeds'))).not.toBe(before);
    if (operation === 'edit' || operation === 'delete') {
      await expect(dialog.getByRole('heading', { name: /^Feeds \(\d+\)$/ })).toBeFocused();
    }
  });
}

test('manual add reaches 50 and reports the limit without removing feeds', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(base => {
    localStorage.setItem('rss-feeds', JSON.stringify(Array.from({ length: 49 }, (_, i) => ({
      ...base, id: `synthetic-${i}`, name: `Source ${i}`, url: `https://source-${i}.example/rss`, enabled: false,
    }))));
    window.dispatchEvent(new Event('feedsUpdated'));
  }, subscriptions[0]);
  await openManager(page);
  await page.getByText('Add feed', { exact: true }).first().click();
  const add = async (name: string, url: string) => {
    await page.getByLabel('Feed name', { exact: true }).fill(name);
    await page.getByLabel('Feed URL', { exact: true }).fill(url);
    await page.getByRole('button', { name: 'Add feed', exact: true }).click();
  };
  await add('Last source', 'https://last.example/rss');
  await expect(page.getByRole('heading', { name: 'Feeds (50)', exact: true })).toBeAttached();
  await add('Extra source', 'https://extra.example/rss');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('50 feeds');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rss-feeds')!).length)).toBe(50);
});

test('feed manager retries a failed source', async ({ page }) => {
  let fail = true;
  await page.route('**/api/feeds?*', async route => {
    if (!fail) return route.fallback();
    const { feedUrls } = route.request().postDataJSON() as { feedUrls: string[] };
    const common = { requestId: 'synthetic-failure', cached: false, timeZone: 'UTC', totalFeeds: feedUrls.length };
    return route.fulfill({ contentType: 'application/x-ndjson', body: [
      { ...common, type: 'meta', completedFeeds: 0 },
      ...feedUrls.map((feedUrl, i) => ({ ...common, type: 'feed_result', completedFeeds: i + 1, feedUrl, status: 'error', itemCount: 0, items: [] })),
      { ...common, type: 'done', completedFeeds: feedUrls.length, totalItemCount: 0 },
    ].map(chunk => JSON.stringify(chunk)).join('\n') + '\n' });
  });
  await page.goto('/');
  await openManager(page);
  const retry = page.getByRole('button', { name: 'Try all feeds again', exact: true });
  await expect(retry).toBeVisible();
  fail = false;
  await retry.click();
  await expect(retry).toHaveCount(0);
  await page.getByRole('button', { name: 'Close feed manager' }).click();
  await expect(page.getByRole('heading', { name: 'A quieter corner of the web' })).toBeVisible();
});
