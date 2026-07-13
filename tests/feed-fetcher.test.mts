import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchFeedXml, FeedResponseTooLargeError, FeedTimeoutError } from '../lib/feed-fetcher';
import { parseFeed, parseFeedsProgressively } from '../lib/rss';
import { createTestServer, waitFor } from './helpers/http-test-server.mts';

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

test('fetchFeedXml timeout includes DNS resolution', async () => {
  await assert.rejects(
    () => fetchFeedXml('https://feeds.example.com/feed.xml', {
      resolveHostname: () => new Promise(() => {}),
      timeoutMs: 20,
    }),
    FeedTimeoutError
  );
});

test('fetchFeedXml can be aborted during DNS resolution', async () => {
  const abortController = new AbortController();
  const pendingFetch = fetchFeedXml('https://feeds.example.com/feed.xml', {
    resolveHostname: () => new Promise(() => {}),
    signal: abortController.signal,
    timeoutMs: 10_000,
  });

  abortController.abort();

  await assert.rejects(pendingFetch, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'AbortError');
    return true;
  });
});

test('fetchFeedXml timeout includes redirect validation', async () => {
  const server = await createTestServer((_request, response) => {
    response.writeHead(302, { Location: 'https://redirect.example.com/feed.xml' });
    response.end();
  });
  let resolutionCount = 0;

  try {
    await assert.rejects(
      () => fetchFeedXml(`${server.url}/feed.xml`, {
        resolveHostname: async () => {
          resolutionCount += 1;
          if (resolutionCount > 2) {
            return new Promise(() => {});
          }
          return [{ address: '127.0.0.1', family: 4 }];
        },
        timeoutMs: 30,
      }),
      FeedTimeoutError
    );
  } finally {
    await server.close();
  }
});

test('fetchFeedXml timeout aborts response-body streaming', async () => {
  let connectionClosed = false;
  const server = await createTestServer((request, response) => {
    request.socket.on('close', () => {
      connectionClosed = true;
    });
    response.writeHead(200, { 'Content-Type': 'application/xml' });
    response.write('<rss>');
  });

  try {
    await assert.rejects(
      () => fetchFeedXml(`${server.url}/feed.xml`, { timeoutMs: 30 }),
      FeedTimeoutError
    );
    await waitFor(() => connectionClosed, 1_000);
  } finally {
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
