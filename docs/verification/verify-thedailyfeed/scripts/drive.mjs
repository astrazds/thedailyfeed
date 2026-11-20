#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, openSync, readdirSync, readlinkSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import net from 'node:net';

const repoRoot = new URL('../../../../', import.meta.url).pathname;
const skillDir = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const scriptPath = new URL(import.meta.url).pathname;
const runDir = join(skillDir, 'run');
const statePath = join(runDir, 'state.json');
const toolsDir = join(skillDir, '.tools', 'pw');
const evidenceRoot = join(skillDir, 'evidence');
const appPort = 3217;
const fixturePort = 3218;
const metroPort = appPort + 4970;
const holdMs = 2500;
const timeZone = 'Australia/Sydney';
const features = ['add-feed', 'read-edition', 'refresh-feeds', 'offline-snapshot'];
const appMarker = 'scripts/dev.mjs';
const fixtureMarker = 'serve-fixture';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readState() {
  return JSON.parse(readFileSync(statePath, 'utf8'));
}

function writeState(state) {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function cmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`).toString('utf8').replaceAll('\0', ' ').trim();
  } catch {
    return '';
  }
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pids() {
  return readdirSync('/proc').filter((name) => /^\d+$/.test(name)).map(Number);
}

function parentPid(pid) {
  try {
    const line = readFileSync(`/proc/${pid}/status`, 'utf8').split('\n').find((row) => row.startsWith('PPid:'));
    return Number(line?.split(/\s+/)[1]);
  } catch {
    return 0;
  }
}

function descendants(root) {
  const parents = new Map(pids().map((pid) => [pid, parentPid(pid)]));
  const found = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, parent] of parents) {
      if (found.has(parent) && !found.has(pid)) {
        found.add(pid);
        grew = true;
      }
    }
  }
  return [...found];
}

function listenPids(port) {
  const hex = port.toString(16).toUpperCase().padStart(4, '0');
  const inodes = new Set();
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const local = parts[1].toUpperCase();
      if (!local.endsWith(`:${hex}`) || parts[3].toUpperCase() !== '0A') continue;
      inodes.add(parts[9]);
    }
  }
  const owners = [];
  for (const pid of pids()) {
    let fds = [];
    try {
      fds = readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      let link = '';
      try {
        link = readlinkSync(`/proc/${pid}/fd/${fd}`);
      } catch {
        continue;
      }
      const match = /^socket:\[(\d+)\]$/.exec(link);
      if (match && inodes.has(match[1])) owners.push(pid);
    }
  }
  return owners;
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function rfc822(zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const raw = parts.timeZoneName.replace('GMT', '').replace('UTC', '');
  let offset = '+0000';
  if (raw) {
    const match = /^([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(raw);
    if (!match) throw new Error(`Unparsed offset ${parts.timeZoneName}`);
    offset = `${match[1]}${match[2].padStart(2, '0')}${match[3] ?? '00'}`;
  }
  return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${offset}`;
}

function editionDate(zone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());
}

function rssDocument(title, itemTitle, link) {
  const published = rfc822(timeZone);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${title}</title>
    <link>${link}</link>
    <description>Local fixture feed for ${title}.</description>
    <item>
      <title>${itemTitle}</title>
      <link>${link}</link>
      <pubDate>${published}</pubDate>
      <description>${itemTitle} is in today's edition.</description>
    </item>
  </channel>
</rss>
`;
}

function feedUrls(state, feature) {
  const query = `run=${state.runId}&feature=${feature}`;
  return {
    morning: `${state.fixtureOrigin}/morning.xml?${query}`,
    evening: `${state.fixtureOrigin}/evening.xml?${query}`,
  };
}

function inventory(state, feature) {
  const urls = feedUrls(state, feature);
  const addedAt = new Date().toISOString();
  return [
    { id: 'verify-morning', name: 'Morning', url: urls.morning, enabled: true, addedAt },
    { id: 'verify-evening', name: 'Evening', url: urls.evening, enabled: true, addedAt },
  ];
}

async function killTree(root, marker) {
  if (!alive(root)) return;
  const command = cmdline(root);
  if (!command.includes(marker)) throw new Error(`Refusing to kill ${root} because its command is ${command}`);
  let pending = descendants(root);
  for (const pid of pending) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && pending.some(alive)) await sleep(100);
  const leftovers = new Set();
  for (const pid of pending) {
    if (!alive(pid)) continue;
    for (const child of descendants(pid)) leftovers.add(child);
  }
  for (const pid of leftovers) {
    if (alive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  }
}

async function serveFixture() {
  const portFlag = process.argv.indexOf('--port');
  const holdFlag = process.argv.indexOf('--hold-ms');
  const port = Number(process.argv[portFlag + 1]);
  const hold = Number(process.argv[holdFlag + 1]);
  const counts = { morningDone: 0, eveningOpen: 0, eveningDone: 0 };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(counts));
      return;
    }
    const evening = url.pathname === '/evening.xml';
    const morning = url.pathname === '/morning.xml';
    if (!evening && !morning) {
      res.writeHead(404);
      res.end('missing fixture');
      return;
    }
    const body = morning
      ? rssDocument('Morning', 'Morning dispatch', `${stateOrigin(port)}${url.pathname}`)
      : rssDocument('Evening', 'Evening dispatch', `${stateOrigin(port)}${url.pathname}`);
    res.writeHead(200, {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
    });
    if (morning) {
      res.end(body);
      counts.morningDone += 1;
      return;
    }
    counts.eveningOpen += 1;
    setTimeout(() => {
      if (!res.writableEnded && !res.destroyed) {
        res.end(body);
        counts.eveningDone += 1;
      }
      counts.eveningOpen -= 1;
    }, hold);
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  console.log(`fixture listening ${port}`);
}

function stateOrigin(port) {
  return `http://127.0.0.1:${port}`;
}

async function fixtureStatus(origin) {
  const response = await fetch(`${origin}/status`);
  if (!response.ok) throw new Error(`Fixture status returned ${response.status}`);
  return response.json();
}

async function ensureChromium() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = toolsDir;
  mkdirSync(toolsDir, { recursive: true });
  const { chromium } = await import('@playwright/test');
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return chromium;
  } catch (error) {
    console.error(`Chromium launch failed (${error instanceof Error ? error.message : error}). Installing into ${toolsDir}.`);
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(repoRoot, 'node_modules/@playwright/test/cli.js'), 'install', 'chromium'], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
      });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`playwright install exited ${code}`))));
    });
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return chromium;
  }
}

async function spawnLogged(command, args, logName, marker) {
  mkdirSync(runDir, { recursive: true });
  const fd = openSync(join(runDir, logName), 'a');
  const lineBuffered = existsSync('/usr/bin/stdbuf');
  const child = spawn(lineBuffered ? '/usr/bin/stdbuf' : command, lineBuffered ? ['-oL', '-eL', command, ...args] : args, {
    cwd: repoRoot,
    detached: true,
    env: process.env,
    stdio: ['ignore', fd, fd],
  });
  child.unref();
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (child.pid && cmdline(child.pid).includes(marker)) return child.pid;
    await sleep(50);
  }
  throw new Error(`${marker} did not stay up (${cmdline(child.pid ?? 0)})`);
}

async function waitFor(read, timeout, label) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await read();
    if (last?.ok) return last;
    await sleep(100);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function countIs(locator, expected, timeout, label) {
  await waitFor(async () => ({ ok: (await locator.count()) === expected, count: await locator.count() }), timeout, label);
  return locator;
}

function trackPosts(page) {
  const rows = new Map();
  const interesting = (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/feeds';
  page.on('request', (request) => {
    if (interesting(request)) rows.set(request, { done: false, failed: false, at: Date.now() });
  });
  page.on('requestfinished', (request) => {
    const row = rows.get(request);
    if (row) row.done = true;
  });
  page.on('requestfailed', (request) => {
    const row = rows.get(request);
    if (row) {
      row.done = true;
      row.failed = true;
    }
  });
  return () => {
    const values = [...rows.values()];
    return {
      started: values.length,
      inFlight: values.filter((row) => !row.done).length,
      failed: values.filter((row) => row.failed).length,
      at: values.map((row) => row.at),
    };
  };
}

async function headerState(page) {
  const header = page.getByTestId('feed-header');
  const headerCount = await header.count();
  if (headerCount !== 1) return { headerCount, barCount: 0, text: '', now: null, max: null };
  const bar = header.locator('[aria-label="Feed loading progress"]');
  const barCount = await bar.count();
  return {
    headerCount,
    barCount,
    text: await header.innerText(),
    now: barCount === 1 ? await bar.getAttribute('aria-valuenow') : null,
    max: barCount === 1 ? await bar.getAttribute('aria-valuemax') : null,
  };
}

async function articleTitles(page) {
  const nodes = page.getByTestId('article-title');
  const count = await nodes.count();
  const titles = [];
  for (let index = 0; index < count; index += 1) titles.push((await nodes.nth(index).innerText()).trim());
  return titles;
}

async function openReader(chromium, origin, feeds) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    timezoneId: timeZone,
    locale: 'en-US',
    colorScheme: 'light',
  });
  await context.addInitScript((stored) => {
    localStorage.setItem('rss-feeds', JSON.stringify(stored));
    localStorage.removeItem('rss-offline-feed-snapshots-v1');
  }, feeds);
  const page = await context.newPage();
  const posts = trackPosts(page);
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { browser, context, page, posts, consoleErrors };
}

async function gotoReader(page, origin) {
  const deadline = Date.now() + 180000;
  let last = 'reader not ready';
  while (Date.now() < deadline) {
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await countIs(page.getByRole('heading', { name: 'The Daily Feed', exact: true }), 1, 20000, 'heading The Daily Feed');
      return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      await sleep(500);
    }
  }
  throw new Error(last);
}

async function streamGap(page, origin, posts) {
  const header = await headerState(page);
  const titles = await articleTitles(page);
  const post = posts();
  const fixture = await fixtureStatus(origin);
  const morning = titles.filter((title) => title === 'Morning dispatch').length;
  const evening = titles.filter((title) => title === 'Evening dispatch').length;
  const barAgrees = header.now === null || (header.now === '1' && header.max === '2');
  const ok = header.headerCount === 1
    && header.barCount === 1
    && header.text.includes('1 of 2 feeds checked')
    && barAgrees
    && morning === 1
    && evening === 0
    && post.inFlight >= 1
    && fixture.eveningOpen >= 1;
  return { ok, header, titles, post, fixture };
}

async function bothArticles(page, posts) {
  const header = await headerState(page);
  const titles = await articleTitles(page);
  const post = posts();
  const date = editionDate(timeZone);
  const ok = titles.filter((title) => title === 'Morning dispatch').length === 1
    && titles.filter((title) => title === 'Evening dispatch').length === 1
    && post.inFlight === 0
    && header.headerCount === 1
    && header.text.includes(date)
    && header.text.includes('2 items')
    && !header.text.includes('1 of 2 feeds checked');
  return { ok, header, titles, post, date };
}

async function storageOf(page) {
  return page.evaluate(() => ({
    feeds: localStorage.getItem('rss-feeds'),
    snapshot: localStorage.getItem('rss-offline-feed-snapshots-v1'),
  }));
}

function writeEvidence(feature, files) {
  const dir = join(evidenceRoot, feature);
  mkdirSync(dir, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    if (value === undefined) continue;
    writeFileSync(join(dir, name), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  }
  return dir;
}

async function settleBoth(page, posts) {
  return waitFor(() => bothArticles(page, posts), 30000, 'both articles');
}

async function runAddFeed(page, state) {
  const urls = feedUrls(state, 'add-feed');
  await countIs(page.getByText('No feeds yet', { exact: true }), 1, 30000, 'empty inventory');
  await countIs(page.getByTestId('connection-settings'), 1, 15000, 'connection-settings');
  await page.getByTestId('connection-settings').click();
  await countIs(page.getByRole('dialog'), 1, 15000, 'feed manager dialog');
  const dialog = page.getByRole('dialog');
  const disclosure = dialog.getByRole('button', { name: 'Add feed options', exact: true });
  await countIs(disclosure, 1, 15000, 'Add feed options');
  if ((await disclosure.getAttribute('aria-expanded')) !== 'true') await disclosure.click();
  const form = dialog.getByRole('form', { name: 'Add feed', exact: true });
  await countIs(form, 1, 15000, 'Add feed form');
  await countIs(form.getByLabel('Feed name', { exact: true }), 1, 15000, 'Feed name');
  await countIs(form.getByLabel('Feed URL', { exact: true }), 1, 15000, 'Feed URL');
  await form.getByLabel('Feed name', { exact: true }).fill('Morning');
  await form.getByLabel('Feed URL', { exact: true }).fill(urls.morning);
  await countIs(form.getByRole('button', { name: 'Add feed', exact: true }), 1, 15000, 'Add feed submit');
  await form.getByRole('button', { name: 'Add feed', exact: true }).click();
  await waitFor(async () => {
    const titles = await articleTitles(page);
    return { ok: titles.filter((title) => title === 'Morning dispatch').length === 1, titles };
  }, 30000, 'Morning dispatch');
  await countIs(form.getByRole('button', { name: 'Add feed', exact: true }), 1, 30000, 'Add feed ready again');
  await form.getByLabel('Feed name', { exact: true }).fill('Evening');
  await form.getByLabel('Feed URL', { exact: true }).fill(urls.evening);
  await form.getByRole('button', { name: 'Add feed', exact: true }).click();
  const gap = await waitFor(() => streamGap(page, state.fixtureOrigin, page.posts), 30000, 'add-feed stream gap');
  await page.screenshot({ path: join(evidenceRoot, 'add-feed', 'during.png'), fullPage: true });
  const done = await settleBoth(page, page.posts);
  await countIs(dialog.getByRole('button', { name: 'Close feed manager', exact: true }), 1, 15000, 'Close feed manager');
  await dialog.getByRole('button', { name: 'Close feed manager', exact: true }).click();
  await countIs(page.getByRole('dialog'), 0, 15000, 'closed feed manager');
  await page.screenshot({ path: join(evidenceRoot, 'add-feed', 'after.png'), fullPage: true });
  const stored = await waitFor(async () => {
    const value = await storageOf(page);
    const ok = Boolean(value.feeds?.includes(urls.morning) && value.feeds?.includes(urls.evening) && value.snapshot?.includes('Morning dispatch') && value.snapshot?.includes('Evening dispatch'));
    return { ok, value };
  }, 10000, 'stored feeds and snapshot');
  const aria = await page.getByTestId('feed-header').ariaSnapshot();
  return { gap, done, stored: stored.value, aria, urls };
}

async function runReadEdition(page, state) {
  const gap = await waitFor(() => streamGap(page, state.fixtureOrigin, page.posts), 30000, 'read-edition stream gap');
  await page.screenshot({ path: join(evidenceRoot, 'read-edition', 'during.png'), fullPage: true });
  const done = await settleBoth(page, page.posts);
  await page.screenshot({ path: join(evidenceRoot, 'read-edition', 'after.png'), fullPage: true });
  const urls = feedUrls(state, 'read-edition');
  const stored = await waitFor(async () => {
    const value = await storageOf(page);
    const ok = Boolean(value.snapshot?.includes('Morning dispatch') && value.feeds?.includes(urls.evening));
    return { ok, value };
  }, 10000, 'read-edition snapshot');
  const aria = await page.getByTestId('feed-header').ariaSnapshot();
  return { gap, done, stored: stored.value, aria, urls };
}

async function runRefresh(page, state) {
  const first = await settleBoth(page, page.posts);
  const before = page.posts();
  await countIs(page.getByTestId('refresh'), 1, 15000, 'refresh');
  const clickedAt = Date.now();
  await page.getByTestId('refresh').click();
  const second = await waitFor(async () => {
    const post = page.posts();
    const afterClick = post.at.filter((at) => at >= clickedAt).length;
    return { ok: post.started > before.started && afterClick >= 1 && post.inFlight === 0, post, afterClick };
  }, 30000, 'refresh post');
  const done = await settleBoth(page, page.posts);
  await page.screenshot({ path: join(evidenceRoot, 'refresh-feeds', 'after.png'), fullPage: true });
  const aria = await page.getByTestId('feed-header').ariaSnapshot();
  return { first, before, second, done, aria, urls: feedUrls(state, 'refresh-feeds') };
}

async function visibleTextCount(page, text) {
  const nodes = page.getByText(text, { exact: true });
  const count = await nodes.count();
  let visible = 0;
  for (let index = 0; index < count; index += 1) {
    const node = nodes.nth(index);
    const inStatus = await node.evaluate((element) => Boolean(element.closest('[data-testid="status"]')));
    if (!inStatus && await node.isVisible()) visible += 1;
  }
  return { count, visible };
}

async function runOffline(page, state, context) {
  const loaded = await settleBoth(page, page.posts);
  const urls = feedUrls(state, 'offline-snapshot');
  await waitFor(async () => {
    const value = await storageOf(page);
    return { ok: Boolean(value.snapshot?.includes('Morning dispatch')), value };
  }, 10000, 'snapshot before offline');
  const before = await fixtureStatus(state.fixtureOrigin);
  await context.setOffline(true);
  await countIs(page.getByTestId('refresh'), 1, 15000, 'offline refresh');
  await page.getByTestId('refresh').click();
  const notice = 'Unable to refresh. Showing saved items from today.';
  const shown = await waitFor(async () => {
    const text = await visibleTextCount(page, notice);
    const titles = await articleTitles(page);
    const ok = text.visible === 1
      && titles.filter((title) => title === 'Morning dispatch').length === 1
      && titles.filter((title) => title === 'Evening dispatch').length === 1;
    return { ok, text, titles };
  }, 20000, 'offline snapshot notice');
  const after = await fixtureStatus(state.fixtureOrigin);
  if (after.morningDone !== before.morningDone || after.eveningDone !== before.eveningDone || after.eveningOpen !== 0) {
    throw new Error(`Offline refresh fetched the fixture: before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
  }
  await page.screenshot({ path: join(evidenceRoot, 'offline-snapshot', 'after.png'), fullPage: true });
  const aria = await page.getByTestId('feed-header').ariaSnapshot();
  return { loaded, shown, before, after, aria, urls };
}

async function run(feature) {
  if (!features.includes(feature)) throw new Error(`Unknown feature ${feature}. Use ${features.join(', ')}.`);
  const started = Date.now();
  const state = readState();
  const report = await doctor({ exit: false });
  if (!report.ok) throw new Error('Doctor failed');
  const chromium = await ensureChromium();
  const feeds = feature === 'add-feed' ? [] : inventory(state, feature);
  const session = await openReader(chromium, state.origin, feeds);
  session.page.posts = session.posts;
  mkdirSync(join(evidenceRoot, feature), { recursive: true });
  rmSync(join(evidenceRoot, feature, 'failure.json'), { force: true });
  rmSync(join(evidenceRoot, feature, 'failure.png'), { force: true });
  try {
    await gotoReader(session.page, state.origin);
    let result;
    if (feature === 'add-feed') result = await runAddFeed(session.page, state);
    else if (feature === 'read-edition') result = await runReadEdition(session.page, state);
    else if (feature === 'refresh-feeds') result = await runRefresh(session.page, state);
    else result = await runOffline(session.page, state, session.context);
    const verifyMs = Date.now() - started;
    const dir = writeEvidence(feature, {
      'action.txt': actionText(feature, result, verifyMs),
      'stream.json': result,
      'storage.json': result.stored ?? await storageOf(session.page),
      'banner.aria.txt': result.aria.endsWith('\n') ? result.aria : `${result.aria}\n`,
      'console.txt': session.consoleErrors.length ? `${session.consoleErrors.join('\n')}\n` : undefined,
    });
    console.log(`pass feature=${feature} evidence=${dir} verify_ms=${verifyMs}`);
  } catch (error) {
    const sample = {
      error: error instanceof Error ? error.message : String(error),
      titles: await articleTitles(session.page).catch(() => []),
      header: await headerState(session.page).catch(() => null),
      posts: session.posts(),
      fixture: await fixtureStatus(state.fixtureOrigin).catch(() => null),
      console: session.consoleErrors,
    };
    writeEvidence(feature, { 'failure.json': sample });
    await session.page.screenshot({ path: join(evidenceRoot, feature, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await session.browser.close();
  }
}

function actionText(feature, result, verifyMs) {
  const lines = [
    `feature: ${feature}`,
    `verify_ms: ${verifyMs}`,
    `timezone: ${timeZone}`,
    `morning: ${result.urls.morning}`,
    `evening: ${result.urls.evening}`,
  ];
  if (result.gap) {
    lines.push('action: show Morning dispatch while Evening dispatch is absent, the header says 1 of 2 feeds checked, POST /api/feeds is in flight, and the evening fixture connection is open');
    lines.push(`gap: ${JSON.stringify(result.gap)}`);
  }
  if (result.done) lines.push(`settled: ${JSON.stringify(result.done.header?.text ?? result.done)}`);
  if (result.second) lines.push(`refresh: posts before ${result.before.started}, after click ${JSON.stringify(result.second.post)}`);
  if (result.shown) lines.push(`offline notice visible count: ${result.shown.text.visible}`);
  if (result.before && result.after) lines.push(`fixture before ${JSON.stringify(result.before)} after ${JSON.stringify(result.after)}`);
  return `${lines.join('\n')}\n`;
}

async function launch() {
  const started = Date.now();
  if (existsSync(statePath)) {
    const previous = JSON.parse(readFileSync(statePath, 'utf8'));
    if (alive(previous.appPid) || alive(previous.fixturePid)) {
      throw new Error(`A verification session is already running as app ${previous.appPid} fixture ${previous.fixturePid}`);
    }
  }
  for (const port of [appPort, fixturePort, metroPort]) {
    if (!await portFree(port)) throw new Error(`Port ${port} is already in use`);
  }
  const browserStarted = Date.now();
  const chromium = await ensureChromium();
  const browserMs = Date.now() - browserStarted;
  const runId = randomBytes(4).toString('hex');
  const fixturePid = await spawnLogged(process.execPath, [scriptPath, 'serve-fixture', '--port', String(fixturePort), '--hold-ms', String(holdMs)], 'fixture.log', fixtureMarker);
  const appPid = await spawnLogged(process.execPath, ['scripts/dev.mjs', '--hostname', '127.0.0.1', '--port', String(appPort)], 'app.log', appMarker);
  const state = {
    appPid,
    fixturePid,
    runId,
    origin: `http://127.0.0.1:${appPort}`,
    fixtureOrigin: `http://127.0.0.1:${fixturePort}`,
    timeZone,
    holdMs,
  };
  writeState(state);
  try {
    await waitFor(async () => ({ ok: (await fixtureStatus(state.fixtureOrigin).then(() => true).catch(() => false)) }), 10000, 'fixture');
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ timezoneId: timeZone, locale: 'en-US' });
      await context.addInitScript(() => {
        localStorage.setItem('rss-feeds', '[]');
        localStorage.removeItem('rss-offline-feed-snapshots-v1');
      });
      const page = await context.newPage();
      await gotoReader(page, state.origin);
      await countIs(page.getByText('No feeds yet', { exact: true }), 1, 30000, 'ready empty inventory');
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error(readFileSync(join(runDir, 'app.log'), 'utf8').slice(-4000));
    await cleanup();
    throw error;
  }
  const setupMs = Date.now() - started;
  console.log(`ready url=${state.origin} fixture=${state.fixtureOrigin} pid=${appPid} browser_ms=${browserMs} setup_ms=${setupMs}`);
}

async function doctor(options = { exit: true }) {
  let state;
  try {
    state = readState();
  } catch {
    console.error('doctor: no verification session');
    if (options.exit) process.exitCode = 1;
    return { ok: false };
  }
  const appCommand = cmdline(state.appPid);
  const fixtureCommand = cmdline(state.fixturePid);
  const listeners = listenPids(appPort);
  const tree = alive(state.appPid) ? descendants(state.appPid) : [];
  const response = await fetch(state.origin).catch(() => null);
  const body = response ? await response.text() : '';
  const ok = alive(state.appPid)
    && appCommand.includes(appMarker)
    && appCommand.includes(String(appPort))
    && alive(state.fixturePid)
    && fixtureCommand.includes(fixtureMarker)
    && listeners.length > 0
    && listeners.every((pid) => tree.includes(pid))
    && response?.ok
    && body.includes('<html');
  const report = {
    ok,
    pid: state.appPid,
    fixturePid: state.fixturePid,
    origin: state.origin,
    listeners,
    status: response?.status ?? 0,
  };
  console.log(ok ? `doctor ok ${JSON.stringify(report)}` : `doctor failed ${JSON.stringify(report)}`);
  if (!ok && options.exit) process.exitCode = 1;
  return report;
}

async function cleanup() {
  let state = null;
  try {
    state = readState();
  } catch {
    state = null;
  }
  if (state?.fixturePid) await killTree(state.fixturePid, fixtureMarker).catch((error) => console.error(error.message));
  if (state?.appPid) await killTree(state.appPid, appMarker).catch((error) => console.error(error.message));
  rmSync(runDir, { recursive: true, force: true });
  console.log('cleanup ok');
  for (const feature of features) console.log(`kept ${join(evidenceRoot, feature)}`);
}

const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  RATE_LIMIT_MAX_REQUESTS: '100',
  PATH: `${join(repoRoot, 'node_modules/.bin')}${delimiter}${process.env.PATH ?? ''}`,
};
process.env.NEXT_TELEMETRY_DISABLED = env.NEXT_TELEMETRY_DISABLED;
process.env.RATE_LIMIT_MAX_REQUESTS = env.RATE_LIMIT_MAX_REQUESTS;
process.env.PATH = env.PATH;

const command = process.argv[2];
if (command === 'serve-fixture') await serveFixture();
else if (command === 'launch') await launch();
else if (command === 'doctor') await doctor();
else if (command === 'run') await run(process.argv[3]);
else if (command === 'cleanup') await cleanup();
else {
  console.error('usage: drive.mjs launch|doctor|run <feature>|cleanup|serve-fixture');
  process.exitCode = 1;
}
