import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/feeds/route';
import { cacheFeed } from '../lib/feed-cache';
import { getFeedApiMetrics } from '../lib/metrics';
import type { FeedItem } from '../lib/rss';
import { executeFeedRequest, executeFeedRequestProgressively } from '../lib/feed-request';

const TODAY_REFERENCE_DATE = new Date('2026-06-02T12:00:00.000Z');

function feedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: 'Today post',
    link: 'https://example.com/today',
    pubDate: new Date('2026-06-02T09:00:00.000Z'),
    source: 'Example',
    ...overrides,
  };
}

function routeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return feedItem({
    pubDate: new Date(),
    ...overrides,
  });
}

interface CompletionLog {
  message: string;
  context: Record<string, unknown>;
}

function parseCompletionLogLine(line: string): CompletionLog | null {
  try {
    const entry = JSON.parse(line) as Record<string, unknown>;
    if (entry.event !== 'feed_api_request_complete' || typeof entry.message !== 'string') {
      return null;
    }

    return {
      message: entry.message,
      context: entry,
    };
  } catch {
    const contextStart = line.indexOf('{');
    if (contextStart === -1) {
      return null;
    }

    const context = JSON.parse(line.slice(contextStart)) as Record<string, unknown>;
    if (context.event !== 'feed_api_request_complete') {
      return null;
    }

    return {
      message: line.slice(0, contextStart).trim(),
      context,
    };
  }
}

async function captureCompletionLog(run: () => Promise<void>): Promise<CompletionLog> {
  const originalInfo = console.info;
  const lines: string[] = [];
  console.info = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };

  try {
    await run();
  } finally {
    console.info = originalInfo;
  }

  const completionLogs = lines.map(parseCompletionLogLine).filter((log) => log !== null);
  assert.equal(completionLogs.length, 1);
  return completionLogs[0];
}

function telemetryFactKeys(context: Record<string, unknown>): string[] {
  return Object.keys(context)
    .filter(
      (key) =>
        ![
          'timestamp',
          'level',
          'service',
          'env',
          'runtime',
          'appVersion',
          'appCommit',
          'pid',
          'message',
          'method',
          'route',
          'ip',
          'clientIdentitySource',
          'clientIdentityHeader',
          'requestId',
          'remainingRateLimit',
        ].includes(key)
    )
    .sort();
}

test('all-cache feed requests produce a cached aggregate outcome and metrics fact', async () => {
  const outcome = await executeFeedRequest(
    {
      feedSet: {
        feedUrls: ['https://example.com/feed.xml'],
        timeZone: 'UTC',
        originalFeedCount: 1,
        uniqueFeedCount: 1,
        duplicateFeedCount: 0,
      },
      requestId: 'request-1',
      todayReferenceDate: TODAY_REFERENCE_DATE,
      startedAt: 100,
    },
    {
      now: () => 125,
      getCachedFeedSplit: () => ({
        cached: [{ feedUrl: 'https://example.com/feed.xml', items: [feedItem()] }],
        missing: [],
      }),
      cacheFeed: () => {},
      parseFeedsProgressively: async function* () {
        throw new Error('parser should not run for an all-cache feed set');
      },
    }
  );

  assert.equal(outcome.cached, true);
  assert.equal(outcome.requestId, 'request-1');
  assert.equal(outcome.items.length, 1);
  assert.deepEqual(outcome.metrics, {
    requestId: 'request-1',
    cached: true,
    durationMs: 25,
    parseDurationMs: 0,
    itemCount: 1,
    feedCount: 1,
    completedFeedCount: 1,
    timeoutFeedCount: 0,
    errorFeedCount: 0,
  });
});

test('mixed feed requests filter today items, cache successful fetches, and report aggregate counts', async () => {
  const cachedToday = feedItem({
    title: 'Cached today',
    link: 'https://example.com/cached-today',
    pubDate: new Date('2026-06-02T10:00:00.000Z'),
  });
  const fetchedToday = feedItem({
    title: 'Fetched today',
    link: 'https://example.com/fetched-today',
    pubDate: new Date('2026-06-02T11:00:00.000Z'),
  });
  const fetchedYesterday = feedItem({
    title: 'Fetched yesterday',
    link: 'https://example.com/fetched-yesterday',
    pubDate: new Date('2026-06-01T11:00:00.000Z'),
  });
  const cachedWrites: string[] = [];
  const nowValues = [110, 160, 170];

  const outcome = await executeFeedRequest(
    {
      feedSet: {
        feedUrls: [
          'https://example.com/cached.xml',
          'https://example.com/success.xml',
          'https://example.com/timeout.xml',
          'https://example.com/error.xml',
        ],
        timeZone: 'UTC',
        originalFeedCount: 5,
        uniqueFeedCount: 4,
        duplicateFeedCount: 1,
      },
      requestId: 'request-2',
      todayReferenceDate: TODAY_REFERENCE_DATE,
      startedAt: 100,
    },
    {
      now: () => nowValues.shift() ?? 170,
      getCachedFeedSplit: () => ({
        cached: [{ feedUrl: 'https://example.com/cached.xml', items: [cachedToday] }],
        missing: [
          'https://example.com/success.xml',
          'https://example.com/timeout.xml',
          'https://example.com/error.xml',
        ],
      }),
      cacheFeed: (feedUrl) => {
        cachedWrites.push(feedUrl);
      },
      parseFeedsProgressively: async function* () {
        yield {
          feedUrl: 'https://example.com/success.xml',
          items: [fetchedYesterday, fetchedToday],
          durationMs: 15,
          status: 'success',
        };
        yield {
          feedUrl: 'https://example.com/timeout.xml',
          items: [],
          durationMs: 30,
          status: 'timeout',
        };
        yield {
          feedUrl: 'https://example.com/error.xml',
          items: [],
          durationMs: 20,
          status: 'error',
        };
      },
    }
  );

  assert.equal(outcome.cached, false);
  assert.deepEqual(
    outcome.items.map((item) => item.title),
    ['Fetched today', 'Cached today']
  );
  assert.deepEqual(cachedWrites, ['https://example.com/success.xml']);
  assert.equal(outcome.cachedFeedCount, 1);
  assert.equal(outcome.fetchedFeedCount, 3);
  assert.equal(outcome.timedOutFeedCount, 1);
  assert.equal(outcome.failedFeedCount, 1);
  assert.deepEqual(outcome.metrics, {
    requestId: 'request-2',
    cached: false,
    durationMs: 60,
    parseDurationMs: 60,
    itemCount: 2,
    feedCount: 5,
    completedFeedCount: 4,
    timeoutFeedCount: 1,
    errorFeedCount: 1,
  });
});

test('mixed feed requests use the Feed request start time as Today for cached and fetched Feed items', async () => {
  const requestStartedAt = new Date('2030-01-01T12:30:00.000Z').getTime();
  const cachedLocalToday = feedItem({
    title: 'Cached local Today',
    link: 'https://example.com/cached-local-today',
    pubDate: new Date('2030-01-01T11:00:00.000Z'),
  });
  const fetchedLocalToday = feedItem({
    title: 'Fetched local Today',
    link: 'https://example.com/fetched-local-today',
    pubDate: new Date('2030-01-02T08:30:00.000Z'),
  });
  const fetchedLocalYesterday = feedItem({
    title: 'Fetched local yesterday',
    link: 'https://example.com/fetched-local-yesterday',
    pubDate: new Date('2030-01-01T09:00:00.000Z'),
  });

  const outcome = await executeFeedRequest(
    {
      feedSet: {
        feedUrls: ['https://example.com/cached.xml', 'https://example.com/success.xml'],
        timeZone: 'Pacific/Kiritimati',
        originalFeedCount: 2,
        uniqueFeedCount: 2,
        duplicateFeedCount: 0,
      },
      requestId: 'request-today-reference',
      startedAt: requestStartedAt,
    },
    {
      now: () => requestStartedAt + 25,
      getCachedFeedSplit: () => ({
        cached: [{ feedUrl: 'https://example.com/cached.xml', items: [cachedLocalToday] }],
        missing: ['https://example.com/success.xml'],
      }),
      cacheFeed: () => {},
      parseFeedsProgressively: async function* () {
        yield {
          feedUrl: 'https://example.com/success.xml',
          items: [fetchedLocalYesterday, fetchedLocalToday],
          durationMs: 10,
          status: 'success',
        };
      },
    }
  );

  assert.deepEqual(
    outcome.items.map((item) => item.title),
    ['Fetched local Today', 'Cached local Today']
  );
});

test('progressive feed requests emit feed results and terminal outcome from the shared execution path', async () => {
  const chunks = [];

  for await (const chunk of executeFeedRequestProgressively(
    {
      feedSet: {
        feedUrls: ['https://example.com/cached.xml'],
        timeZone: 'UTC',
        originalFeedCount: 1,
        uniqueFeedCount: 1,
        duplicateFeedCount: 0,
      },
      requestId: 'request-3',
      todayReferenceDate: TODAY_REFERENCE_DATE,
      startedAt: 200,
    },
    {
      now: () => 215,
      getCachedFeedSplit: () => ({
        cached: [{ feedUrl: 'https://example.com/cached.xml', items: [feedItem()] }],
        missing: [],
      }),
      cacheFeed: () => {},
      parseFeedsProgressively: async function* () {
        throw new Error('parser should not run for an all-cache feed set');
      },
    }
  )) {
    chunks.push(chunk);
  }

  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['meta', 'feed_result', 'done']
  );
  assert.deepEqual(chunks[0], {
    type: 'meta',
    requestId: 'request-3',
    cached: true,
    timeZone: 'UTC',
    totalFeeds: 1,
    completedFeeds: 0,
  });
  assert.equal(chunks[1].type, 'feed_result');
  if (chunks[1].type === 'feed_result') {
    assert.equal(chunks[1].status, 'cached');
    assert.equal(chunks[1].cached, true);
    assert.equal(chunks[1].itemCount, 1);
  }
  assert.equal(chunks[2].type, 'done');
  if (chunks[2].type === 'done') {
    assert.equal(chunks[2].cached, true);
    assert.equal(chunks[2].outcome.requestId, 'request-3');
    assert.equal(chunks[2].outcome.metrics.cached, true);
    assert.equal(chunks[2].outcome.metrics.requestId, 'request-3');
    assert.equal(chunks[2].totalItemCount, 1);
  }
});

test('progressive feed requests enforce a request-wide budget for missing feed work', async () => {
  const eventsPromise = (async () => {
    const chunks = [];

    for await (const chunk of executeFeedRequestProgressively(
      {
        feedSet: {
          feedUrls: ['https://example.com/slow.xml'],
          timeZone: 'UTC',
          originalFeedCount: 1,
          uniqueFeedCount: 1,
          duplicateFeedCount: 0,
        },
        requestId: 'request-budget-1',
        requestTimeoutMs: 10,
        todayReferenceDate: TODAY_REFERENCE_DATE,
        startedAt: 200,
      },
      {
        now: () => 225,
        getCachedFeedSplit: () => ({
          cached: [],
          missing: ['https://example.com/slow.xml'],
        }),
        cacheFeed: () => {},
        parseFeedsProgressively: async function* (feedUrls, options) {
          assert.ok(options.signal);

          if (!options.signal.aborted) {
            await new Promise<void>((resolve) => {
              options.signal?.addEventListener('abort', () => resolve(), { once: true });
            });
          }

          yield {
            feedUrl: feedUrls[0],
            items: [],
            durationMs: 10,
            status: 'timeout',
          };
        },
      }
    )) {
      chunks.push(chunk);
    }

    return chunks;
  })();

  const chunks = await Promise.race([
    eventsPromise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('request budget did not abort missing feed work')), 250);
    }),
  ]);

  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['meta', 'feed_result', 'done']
  );
  assert.equal(chunks[1].type, 'feed_result');
  if (chunks[1].type === 'feed_result') {
    assert.equal(chunks[1].status, 'timeout');
  }
  assert.equal(chunks[2].type, 'done');
  if (chunks[2].type === 'done') {
    assert.equal(chunks[2].outcome.timedOutFeedCount, 1);
    assert.equal(chunks[2].outcome.metrics.timeoutFeedCount, 1);
  }
});

test('feed route JSON responses use no-store for body-dependent feed sets', async () => {
  cacheFeed('https://example.com/route-cache.xml', [routeFeedItem()]);

  const response = await POST(
    new Request('https://thedailyfeed.test/api/feeds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': 'feed-route-no-store',
        'x-request-id': 'route-request-1',
      },
      body: JSON.stringify({
        feedUrls: ['https://example.com/route-cache.xml'],
        timeZone: 'UTC',
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Request-Id'), 'route-request-1');
  const payload = await response.json();
  assert.equal(payload.cached, true);
  assert.equal(payload.items.length, 1);
});

test('feed route JSON and stream completion logs use the same outcome telemetry facts', async () => {
  cacheFeed('https://example.com/route-json-telemetry-cache.xml', [routeFeedItem()]);
  cacheFeed('https://example.com/route-stream-telemetry-cache.xml', [routeFeedItem()]);

  const jsonLog = await captureCompletionLog(async () => {
    const response = await POST(
      new Request('https://thedailyfeed.test/api/feeds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-real-ip': 'feed-route-json-telemetry',
          'x-request-id': 'route-request-json-telemetry',
        },
        body: JSON.stringify({
          feedUrls: ['https://example.com/route-json-telemetry-cache.xml'],
          timeZone: 'UTC',
        }),
      })
    );

    assert.equal(response.status, 200);
    await response.text();
  });

  const streamLog = await captureCompletionLog(async () => {
    const response = await POST(
      new Request('https://thedailyfeed.test/api/feeds?stream=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson',
          'x-real-ip': 'feed-route-stream-telemetry',
          'x-request-id': 'route-request-stream-telemetry',
        },
        body: JSON.stringify({
          feedUrls: ['https://example.com/route-stream-telemetry-cache.xml'],
          timeZone: 'UTC',
        }),
      })
    );

    assert.equal(response.status, 200);
    await response.text();
  });

  assert.deepEqual(telemetryFactKeys(streamLog.context), telemetryFactKeys(jsonLog.context));
});

test('feed route streamed all-cache responses emit cached terminal metadata and metrics', async () => {
  cacheFeed('https://example.com/route-stream-cache.xml', [routeFeedItem()]);
  const before = getFeedApiMetrics();

  const response = await POST(
    new Request('https://thedailyfeed.test/api/feeds?stream=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
        'x-real-ip': 'feed-route-stream-cache',
        'x-request-id': 'route-request-2',
      },
      body: JSON.stringify({
        feedUrls: ['https://example.com/route-stream-cache.xml'],
        timeZone: 'UTC',
      }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const chunks = (await response.text())
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['meta', 'feed_result', 'done']
  );
  assert.equal(chunks[0].cached, true);
  assert.equal(chunks[1].cached, true);
  assert.equal(chunks[1].status, 'cached');
  assert.equal(chunks[2].cached, true);

  const after = getFeedApiMetrics();
  assert.equal(after.cachedRequests, before.cachedRequests + 1);
});
