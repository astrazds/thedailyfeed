import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 4101;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const FEED_URL = `${BASE_URL}/api/test-feed`;
const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true';

let serverProcess: ReturnType<typeof spawn> | null = null;

async function waitForServerReady(timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/api/metrics`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for Next.js server');
}

before(async () => {
  if (!RUN_INTEGRATION_TESTS) {
    return;
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workdir = path.resolve(currentDir, '..');
  serverProcess = spawn('pnpm', ['run', 'dev', '--port', String(PORT)], {
    cwd: workdir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });

  await waitForServerReady(60_000);
});

after(async () => {
  if (!RUN_INTEGRATION_TESTS) {
    return;
  }

  if (!serverProcess) {
    return;
  }

  serverProcess.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 1000));
});

test('validates feed URLs via /api/feeds/validate', { skip: !RUN_INTEGRATION_TESTS }, async () => {
  const invalidResponse = await fetch(`${BASE_URL}/api/feeds/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: 'ftp://example.com/feed.xml',
    }),
  });
  assert.equal(invalidResponse.status, 400);

  const validResponse = await fetch(`${BASE_URL}/api/feeds/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: FEED_URL,
    }),
  });
  assert.equal(validResponse.status, 200);
  const payload = await validResponse.json();
  assert.equal(payload.valid, true);
});

test(
  'returns cached=true on repeat non-stream request with same feed URL',
  { skip: !RUN_INTEGRATION_TESTS },
  async () => {
  const uniqueFeedUrl = `${FEED_URL}?cache_case=${Date.now()}`;
  const firstResponse = await fetch(`${BASE_URL}/api/feeds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': 'integration-cache-first',
    },
    body: JSON.stringify({
      feedUrls: [uniqueFeedUrl],
      timeZone: 'UTC',
    }),
  });
  assert.equal(firstResponse.status, 200);
  const firstPayload = await firstResponse.json();
  assert.equal(firstPayload.cached, false);

  const secondResponse = await fetch(`${BASE_URL}/api/feeds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': 'integration-cache-second',
    },
    body: JSON.stringify({
      feedUrls: [uniqueFeedUrl],
      timeZone: 'UTC',
    }),
  });
  assert.equal(secondResponse.status, 200);
  const secondPayload = await secondResponse.json();
  assert.equal(secondPayload.cached, true);
  }
);

test('returns JSON feed data in non-stream mode', { skip: !RUN_INTEGRATION_TESTS }, async () => {
  const response = await fetch(`${BASE_URL}/api/feeds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': 'integration-json',
    },
    body: JSON.stringify({
      feedUrls: [FEED_URL],
      timeZone: 'UTC',
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(Array.isArray(payload.items), true);
  assert.ok(payload.items.length > 0);
});

test(
  'streams NDJSON chunks with per-feed status and completion',
  { skip: !RUN_INTEGRATION_TESTS },
  async () => {
  const response = await fetch(`${BASE_URL}/api/feeds?stream=1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
      'x-real-ip': 'integration-stream',
    },
    body: JSON.stringify({
      feedUrls: [FEED_URL],
      timeZone: 'UTC',
    }),
  });

  assert.equal(response.status, 200);
  const text = await response.text();
  const chunks = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.ok(chunks.some((chunk) => chunk.type === 'meta'));
  assert.ok(
    chunks.some(
      (chunk) =>
        chunk.type === 'feed_result' &&
        (chunk.status === 'cached' || chunk.status === 'success') &&
        typeof chunk.itemCount === 'number'
    )
  );
  assert.ok(chunks.some((chunk) => chunk.type === 'done'));
  }
);

test('rate limits requests from the same client IP', { skip: !RUN_INTEGRATION_TESTS }, async () => {
  let lastStatus = 200;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`${BASE_URL}/api/feeds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': 'integration-rate-limit',
      },
      body: JSON.stringify({
        feedUrls: [FEED_URL],
        timeZone: 'UTC',
      }),
    });
    lastStatus = response.status;
  }

  assert.equal(lastStatus, 429);
});
