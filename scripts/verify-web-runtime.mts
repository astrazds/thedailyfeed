import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const sourceOrigin = process.env.RUNTIME_APP_URL;
const previousOrigin = process.env.RUNTIME_PREVIOUS_URL;
const now = new Date('2026-09-08T12:00:00Z');
const feeds = [
  { id: 'retained', name: 'Retained subscription', url: 'https://retained.example/rss', enabled: true, addedAt: '2026-01-01T00:00:00Z' },
  { id: 'disabled', name: 'Disabled subscription', url: 'https://disabled.example/rss', enabled: false, addedAt: '2026-01-02T00:00:00Z' },
];
const item = { title: 'Saved before the Expo upgrade', link: 'https://retained.example/article', source: 'Retained subscription', contentHtml: '<p>Today’s synthetic saved article.</p>', pubDate: '2026-09-08T09:00:00Z' };
const snapshots = [{ cacheKey: 'https://retained.example/rss::UTC', timeZone: 'UTC', dayKey: '2026-09-08', savedAt: now.toISOString(), items: [item] }];
const previousDocument = '<!doctype html><title>Previous reader</title><p>Previous reader</p>';
const previousWorker = `self.addEventListener('install',event=>event.waitUntil(caches.open('previous-reader').then(cache=>cache.put('/',new Response(${JSON.stringify(previousDocument)},{headers:{'Content-Type':'text/html'}}))).then(()=>self.skipWaiting())));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(caches.match('/').then(cached=>cached||fetch(event.request)));});`;
const portProbe = createServer();
await new Promise<void>((resolve) => portProbe.listen(0, '127.0.0.1', resolve));
const backendPort = (portProbe.address() as { port: number }).port;
await new Promise<void>((resolve) => portProbe.close(() => resolve()));
const backendOrigin = sourceOrigin ?? `http://127.0.0.1:${backendPort}`;
const backend = sourceOrigin ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(backendPort)], { stdio: ['ignore', 'pipe', 'pipe'] });
let backendLog = '';
backend?.stdout.on('data', (data) => { backendLog += String(data); });
backend?.stderr.on('data', (data) => { backendLog += String(data); });
let upgrading = false;
const proxy = createServer((incoming, outgoing) => {
  const url = new URL(incoming.url ?? '/', 'http://runtime.test');
  if (url.pathname.startsWith('/api/')) {
    outgoing.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    outgoing.end(JSON.stringify({ error: 'Synthetic offline upstream' }));
    return;
  }
  if (!upgrading && !previousOrigin) {
    outgoing.writeHead(200, { 'Content-Type': url.pathname === '/sw.js' ? 'application/javascript' : 'text/html', 'Cache-Control': 'no-store' });
    outgoing.end(url.pathname === '/sw.js' ? previousWorker : previousDocument);
    return;
  }
  const destination = new URL(incoming.url ?? '/', upgrading ? backendOrigin : previousOrigin);
  const forwarded = request(destination, { method: incoming.method, headers: { ...incoming.headers, host: destination.host } }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  forwarded.on('error', () => { outgoing.writeHead(502); outgoing.end(); });
  incoming.pipe(forwarded);
});
let browser;
try {
  await expect.poll(async () => { try { return (await fetch(backendOrigin)).status; } catch { return 0; } }, { timeout: 60_000 }).toBe(200);
  const documentResponse = await fetch(backendOrigin);
  assert.match(documentResponse.headers.get('content-security-policy') ?? '', /connect-src 'self'/);
  const documentHtml = await documentResponse.text();
  assert.match(documentHtml, /<link rel="manifest" href="\/manifest.webmanifest">/);
  const script = documentHtml.match(/src="(\/_expo\/[^" ]+\.js)"/);
  assert(script, 'Root document must load the Expo bundle');
  const bundle = await fetch(new URL(script[1], backendOrigin));
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers.get('content-type') ?? '', /javascript/);
  assert.equal(bundle.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  const workerResponse = await fetch(new URL('/sw.js', backendOrigin));
  assert.match(workerResponse.headers.get('cache-control') ?? '', /no-store/);
  assert.match(workerResponse.headers.get('content-type') ?? '', /javascript/);
  const invalidRequest = await fetch(new URL('/api/feeds', backendOrigin), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(invalidRequest.status, 400);
  assert.equal(invalidRequest.headers.get('cache-control'), 'no-store');
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US', serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.clock.setFixedTime(now);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(async ({ feeds, snapshots }) => {
    localStorage.setItem('rss-feeds', JSON.stringify(feeds));
    localStorage.setItem('rss-offline-feed-snapshots-v1', JSON.stringify(snapshots));
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  }, { feeds, snapshots });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  upgrading = true;
  await page.evaluate(async () => {
    const changed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker upgrade did not claim this page.')), 30_000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    await (await navigator.serviceWorker.getRegistration())!.update();
    await changed;
  });
  await page.reload();
  await expect(page.getByText(item.title, { exact: true })).toBeVisible();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('rss-feeds')!)), feeds);
  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    }
    return urls;
  });
  const precache = JSON.parse(await readFile('.expo-precache.json', 'utf8')) as { url: string; revision: string }[];
  for (const entry of precache) {
    assert(cachedUrls.some((url) => new URL(url).pathname === entry.url), `Missing precached asset ${entry.url}`);
  }
  assert(!cachedUrls.some((url) => new URL(url).pathname.startsWith('/api/')), 'API responses must not enter worker caches');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(item.title, { exact: true })).toBeVisible();
  await expect(page.getByText('The Daily Feed', { exact: true })).toBeVisible();
  assert(await page.evaluate(() => document.fonts.check('16px RobotoSerif400')), 'Bundled reader fonts load offline');
  await page.evaluate(() => localStorage.setItem('rss-feeds', JSON.stringify([{ id: 'unrelated', name: 'Unrelated', url: 'https://unrelated.example/rss', enabled: true, addedAt: '2026-01-01T00:00:00Z' }])));
  await page.reload();
  await expect(page.getByText(item.title, { exact: true })).toHaveCount(0);
  await page.evaluate(({ feeds }) => localStorage.setItem('rss-feeds', JSON.stringify(feeds)), { feeds });
  await page.clock.setFixedTime(new Date('2026-09-09T12:00:00Z'));
  await page.reload();
  await expect(page.getByText(item.title, { exact: true })).toHaveCount(0);
  assert.deepEqual(errors, [], 'Runtime must not raise browser errors');
  console.log(JSON.stringify({ previousWorker: previousOrigin ? 'previous production Serwist' : 'synthetic installed worker', upgrade: 'pass', retainedSubscriptions: feeds.length, precachedAssets: precache.length, offlineShellAndArticle: 'pass', unrelatedAndStaleSnapshot: 'rejected', apiCacheEntries: 0, browserErrors: errors }, null, 2));
} catch (error) {
  console.error(backendLog);
  throw error;
} finally {
  await browser?.close();
  proxy.closeAllConnections();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  if (backend && backend.exitCode === null && backend.signalCode === null) {
    const exited = new Promise<void>((resolve) => backend.once('exit', () => resolve()));
    backend.kill('SIGTERM');
    await exited;
  }
}
