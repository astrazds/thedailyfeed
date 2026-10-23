#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

const root = new URL('../../../..', import.meta.url);
const repo = root.pathname;
const stateDir = '/tmp/thedailyfeed-verify';
const pidFile = `${stateDir}/pid`;
const port = 3217;
const origin = `http://127.0.0.1:${port}`;
const evidenceDir = new URL('../../evidence/read-edition/', import.meta.url).pathname;

function pid() {
  if (!existsSync(pidFile)) return null;
  const value = Number(readFileSync(pidFile, 'utf8').trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}

function alive(value) {
  if (!value) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForReader() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const deadline = Date.now() + 120_000;
    let lastError = 'reader heading not visible';
    while (Date.now() < deadline) {
      try {
        const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        if ((response?.status() ?? 0) < 500) {
          await page.getByRole('heading', { name: 'The Daily Feed', exact: true }).waitFor({ timeout: 5_000 });
          return;
        }
        lastError = `HTTP ${response?.status() ?? 0}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error(lastError);
  } finally {
    await browser.close();
  }
}

async function launch() {
  if (alive(pid())) throw new Error(`verification server already running as ${pid()}`);
  mkdirSync(stateDir, { recursive: true });
  const log = `${stateDir}/server.log`;
  const child = spawn('node', ['scripts/dev.mjs', '--port', String(port)], {
    cwd: repo,
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.unref();
  writeFileSync(pidFile, `${child.pid}\n`);
  try {
    await waitForReader();
  } catch (error) {
    cleanup();
    throw error;
  }
  console.log(`ready ${origin} pid ${child.pid}`);
}

async function doctor() {
  const value = pid();
  if (!alive(value)) {
    console.error('doctor: verification server is not running');
    process.exitCode = 1;
    return;
  }
  const response = await fetch(origin).catch(() => null);
  const body = response ? await response.text() : '';
  const command = readFileSync(`/proc/${value}/cmdline`, 'utf8').replaceAll('\0', ' ');
  const ok = response?.ok && command.includes('scripts/dev.mjs') && command.includes(String(port));
  console.log(JSON.stringify({
    ok,
    pid: value,
    origin,
    status: response?.status ?? 0,
    command,
    html: body.includes('<html'),
  }));
  if (!ok) process.exitCode = 1;
}

async function drive() {
  const feature = process.argv[3];
  if (feature !== 'read-edition') {
    throw new Error('drive one mapped feature: read-edition');
  }
  if (process.exitCode) return;
  await doctor();
  if (process.exitCode) throw new Error('doctor failed');
  process.exitCode = 0;
  mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const heading = page.getByRole('heading', { name: 'The Daily Feed', exact: true });
    await heading.waitFor({ timeout: 30_000 });
    const banner = page.getByTestId('feed-header');
    await banner.waitFor();
    const aria = await banner.ariaSnapshot();
    const stored = await page.evaluate(() => localStorage.getItem('rss-feeds'));
    writeFileSync(`${evidenceDir}/action.txt`, [
      'feature: read-edition',
      'entry: open /',
      `url: ${page.url()}`,
      'action: wait for heading "The Daily Feed"',
      `banner: ${aria.replaceAll('\n', ' | ')}`,
      `rss-feeds: ${stored ?? 'null'}`,
    ].join('\n') + '\n');
    writeFileSync(`${evidenceDir}/banner.aria.txt`, aria.endsWith('\n') ? aria : `${aria}\n`);
    writeFileSync(`${evidenceDir}/storage.json`, `${stored ?? 'null'}\n`);
    await page.screenshot({ path: `${evidenceDir}/heading.png` });
    console.log(`evidence ${evidenceDir}`);
  } finally {
    await browser.close();
  }
}

function cleanup() {
  const value = pid();
  if (alive(value)) {
    try { process.kill(-value, 'SIGTERM'); } catch {}
  }
  rmSync(stateDir, { recursive: true, force: true });
  console.log('cleaned verification server');
}

const command = process.argv[2];
if (command === 'launch') await launch();
else if (command === 'doctor') await doctor();
else if (command === 'drive') await drive();
else if (command === 'cleanup') cleanup();
else {
  console.error('usage: verify-thedailyfeed.mjs launch|doctor|drive read-edition|cleanup');
  process.exitCode = 1;
}
