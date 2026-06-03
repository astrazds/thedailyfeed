import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchFeedXml, FeedResponseTooLargeError } from '../lib/feed-fetcher';
import { parseFeed, parseFeedsProgressively } from '../lib/rss';

interface TestServer {
  close: () => Promise<void>;
  url: string;
}

async function createTestServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<TestServer> {
  const server = createServer(handler);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    }),
  };
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(condition(), true);
}

test('fetchFeedXml enforces max response size', async () => {
  const server = await createTestServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/xml' });
    response.end('<rss>' + 'x'.repeat(128) + '</rss>');
  });

  try {
    await assert.rejects(
      () => fetchFeedXml(`${server.url}/feed.xml`, { maxBytes: 32 }),
      FeedResponseTooLargeError
    );
  } finally {
    await server.close();
  }
});

test('fetchFeedXml aborts the underlying request when its signal aborts', async () => {
  let connectionClosed = false;
  const server = await createTestServer((request) => {
    request.socket.on('close', () => {
      connectionClosed = true;
    });
  });
  const abortController = new AbortController();

  try {
    const pendingFetch = fetchFeedXml(`${server.url}/feed.xml`, {
      signal: abortController.signal,
      timeoutMs: 10_000,
    });

    setTimeout(() => abortController.abort(), 20);

    await assert.rejects(pendingFetch, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, 'AbortError');
      return true;
    });
    await waitFor(() => connectionClosed, 1_000);
  } finally {
    abortController.abort();
    await server.close();
  }
});

test('parseFeed strips unsafe article links from RSS items', async () => {
  const server = await createTestServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/xml' });
    response.end(`<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Example Feed</title>
          <item>
            <title>Unsafe Item</title>
            <link>javascript:alert(1)</link>
            <pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`);
  });

  try {
    const items = await parseFeed(`${server.url}/feed.xml`);
    assert.equal(items.length, 1);
    assert.equal(items[0].link, '');
  } finally {
    await server.close();
  }
});

test('parseFeedsProgressively timeout aborts the active feed fetch', async () => {
  let connectionClosed = false;
  const server = await createTestServer((request) => {
    request.socket.on('close', () => {
      connectionClosed = true;
    });
  });

  try {
    const results = [];

    for await (const result of parseFeedsProgressively([`${server.url}/feed.xml`], {
      concurrency: 1,
      overallTimeoutMs: 30,
    })) {
      results.push(result);
    }

    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'timeout');
    await waitFor(() => connectionClosed, 1_000);
  } finally {
    await server.close();
  }
});
