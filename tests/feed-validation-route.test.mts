import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { POST as validateFeed } from '../app/api/feeds/validate/route';
import { clearRateLimitState } from '../lib/rate-limiter';
import { parseFeedWithRetry } from '../lib/rss';
import { createTestServer, waitFor } from './helpers/http-test-server.mts';

const execFileAsync = promisify(execFile);

function validationRequest(url: string, signal?: AbortSignal): Request {
  return new Request('https://thedailyfeed.test/api/feeds/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': `feed-validation-budget-${Date.now()}-${Math.random()}`,
    },
    body: JSON.stringify({ url }),
    signal,
  });
}

for (const scenario of ['redirect', 'retry']) {
  const pluralScenario = scenario === 'retry' ? 'retries' : 'redirects';
  test(`feed validation route enforces its aggregate budget across ${pluralScenario}`, async () => {
    await execFileAsync('./node_modules/.bin/tsx', [
      'tests/fixtures/feed-validation-route-budget.mts',
      scenario,
    ], {
      env: {
        ...process.env,
        FEED_OVERALL_TIMEOUT_MS: scenario === 'retry' ? '600' : '55',
      },
    });
  });
}

test('feed operation budget aborts during the retry delay', async () => {
  let requestCount = 0;
  const server = await createTestServer((_request, response) => {
    requestCount += 1;
    response.writeHead(500);
    response.end();
  });

  try {
    await assert.rejects(
      () => parseFeedWithRetry(server.url, 1, 1_000, undefined, {
        signal: AbortSignal.timeout(30),
      }),
      (error: unknown) => error instanceof Error && error.name === 'TimeoutError'
    );
    assert.equal(requestCount, 1);
  } finally {
    await server.close();
  }
});

test('aborting the validation request closes the active socket and prevents retry', async () => {
  clearRateLimitState();
  let requestCount = 0;
  let socketClosed = false;
  const server = await createTestServer((request) => {
    requestCount += 1;
    request.socket.on('close', () => {
      socketClosed = true;
    });
  });
  const controller = new AbortController();

  try {
    const responsePromise = validateFeed(validationRequest(server.url, controller.signal));
    await waitFor(() => requestCount === 1, 1_000);
    controller.abort();

    const response = await responsePromise;
    assert.equal(response.status, 400);
    await waitFor(() => socketClosed, 1_000);
    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.equal(requestCount, 1);
  } finally {
    controller.abort();
    await server.close();
  }
});

test('feed validation still accepts a normal feed within budget', async () => {
  clearRateLimitState();
  const server = await createTestServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/rss+xml' });
    response.end(`<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Budget Test Feed</title>
          <item>
            <title>Current item</title>
            <link>https://example.com/item</link>
            <pubDate>Mon, 13 Jul 2026 10:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`);
  });

  try {
    const response = await validateFeed(validationRequest(server.url));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.valid, true);
    assert.equal(payload.source, 'Budget Test Feed');
  } finally {
    await server.close();
  }
});
