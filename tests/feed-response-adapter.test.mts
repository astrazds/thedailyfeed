import test from 'node:test';
import assert from 'node:assert/strict';
import type { ApiRateLimitResult } from '../lib/api-rate-limit';
import {
  createFeedErrorResponse,
  createFeedJsonResponse,
  createFeedStreamResponse,
  wantsFeedStreamResponse,
} from '../lib/feed-response-adapter';
import type { FeedRequestOutcome, FeedRequestProgressEvent } from '../lib/feed-request';
import type { FeedRequestTelemetryContext } from '../lib/feed-request-telemetry';
import type { LogContext } from '../lib/logger';
import type { FeedItem } from '../lib/rss';

const rateLimit: ApiRateLimitResult = {
  allowed: true,
  identifier: 'feed-response-adapter-test',
  limit: 60,
  remaining: 59,
  resetTime: Date.parse('2026-06-02T13:00:00.000Z'),
  retryAfter: 0,
};

const telemetryContext: FeedRequestTelemetryContext = {
  feedSet: {
    feedUrls: ['https://example.com/feed.xml'],
    timeZone: 'UTC',
    originalFeedCount: 1,
    uniqueFeedCount: 1,
    duplicateFeedCount: 0,
  },
  remainingRateLimit: rateLimit.remaining,
};

const feedItem: FeedItem = {
  title: 'Adapter item',
  link: 'https://example.com/item',
  pubDate: new Date('2026-06-02T09:00:00.000Z'),
  source: 'Example',
};

const outcome: FeedRequestOutcome = {
  requestId: 'response-request-1',
  items: [feedItem],
  cached: true,
  timeZone: 'UTC',
  cachedFeedCount: 1,
  fetchedFeedCount: 0,
  timedOutFeedCount: 0,
  failedFeedCount: 0,
  metrics: {
    requestId: 'response-request-1',
    cached: true,
    durationMs: 25,
    parseDurationMs: 0,
    itemCount: 1,
    feedCount: 1,
    completedFeedCount: 1,
    timeoutFeedCount: 0,
    errorFeedCount: 0,
  },
};

function createLogger() {
  const entries: Array<{ level: string; message: string; context?: LogContext; error?: unknown }> = [];

  return {
    entries,
    logger: {
      info(message: string, context?: LogContext) {
        entries.push({ level: 'info', message, context });
      },
      warn(message: string, context?: LogContext) {
        entries.push({ level: 'warn', message, context });
      },
      error(message: string, error?: unknown, context?: LogContext) {
        entries.push({ level: 'error', message, error, context });
      },
    },
  };
}

async function readNdjson(response: Response): Promise<Array<Record<string, unknown>>> {
  return (await response.text())
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test('stream negotiation is owned by the Feed response adapter', () => {
  assert.equal(
    wantsFeedStreamResponse(
      new Request('https://thedailyfeed.test/api/feeds', {
        headers: { Accept: 'application/x-ndjson' },
      })
    ),
    true
  );
  assert.equal(wantsFeedStreamResponse(new Request('https://thedailyfeed.test/api/feeds?stream=1')), true);
  assert.equal(wantsFeedStreamResponse(new Request('https://thedailyfeed.test/api/feeds')), false);
});

test('JSON Feed responses apply standard headers and record JSON telemetry', async () => {
  const { entries, logger } = createLogger();
  const metrics: unknown[] = [];

  const response = createFeedJsonResponse(outcome, {
    requestId: 'response-request-1',
    rateLimit,
    telemetryContext,
    requestLogger: logger,
    recordMetrics: (metric) => metrics.push(metric),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Request-Id'), 'response-request-1');
  assert.equal(response.headers.get('X-RateLimit-Remaining'), '59');
  assert.deepEqual(await response.json(), {
    items: [
      {
        ...feedItem,
        pubDate: feedItem.pubDate.toISOString(),
      },
    ],
    cached: true,
    timeZone: 'UTC',
  });
  assert.equal(entries[0]?.message, 'Feed API request completed (json fetch)');
  assert.equal(entries[0]?.context?.event, 'feed_api_request_complete');
  assert.deepEqual(metrics, [outcome.metrics]);
});

test('stream Feed responses frame progress chunks, apply headers, and record stream telemetry', async () => {
  const { entries, logger } = createLogger();
  const metrics: unknown[] = [];

  async function* executeProgressively(): AsyncGenerator<FeedRequestProgressEvent> {
    yield {
      type: 'meta',
      requestId: 'response-request-1',
      cached: true,
      timeZone: 'UTC',
      totalFeeds: 1,
      completedFeeds: 0,
    };
    yield {
      type: 'feed_result',
      requestId: 'response-request-1',
      cached: true,
      timeZone: 'UTC',
      totalFeeds: 1,
      completedFeeds: 1,
      feedUrl: 'https://example.com/feed.xml',
      status: 'cached',
      itemCount: 1,
      items: [feedItem],
    };
    yield {
      type: 'done',
      requestId: 'response-request-1',
      cached: true,
      timeZone: 'UTC',
      totalFeeds: 1,
      completedFeeds: 1,
      totalItemCount: 1,
      outcome,
    };
  }

  const response = createFeedStreamResponse(
    {
      feedSet: telemetryContext.feedSet,
      requestId: 'response-request-1',
      startedAt: Date.now(),
      requestSignal: new AbortController().signal,
      rateLimit,
      telemetryContext,
      requestLogger: logger,
      recordMetrics: (metric) => metrics.push(metric),
    },
    { executeProgressively }
  );

  assert.equal(response.headers.get('Content-Type'), 'application/x-ndjson; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Request-Id'), 'response-request-1');

  const chunks = await readNdjson(response);
  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['meta', 'feed_result', 'done']
  );
  const feedResultItems = chunks[1]?.items;
  assert.ok(Array.isArray(feedResultItems));
  const [firstFeedResultItem] = feedResultItems;
  assert.equal(typeof firstFeedResultItem, 'object');
  assert.notEqual(firstFeedResultItem, null);
  assert.equal(
    (firstFeedResultItem as Record<string, unknown>).pubDate,
    feedItem.pubDate.toISOString()
  );
  assert.equal(entries[0]?.message, 'Feed API request completed (streamed fetch)');
  assert.deepEqual(metrics, [outcome.metrics]);
});

test('stream Feed responses emit an error chunk when execution fails', async () => {
  const { entries, logger } = createLogger();

  async function* executeProgressively(): AsyncGenerator<FeedRequestProgressEvent> {
    yield {
      type: 'meta',
      requestId: 'response-request-error',
      cached: false,
      timeZone: 'UTC',
      totalFeeds: 1,
      completedFeeds: 0,
    };
    throw new Error('adapter stream failure');
  }

  const response = createFeedStreamResponse(
    {
      feedSet: telemetryContext.feedSet,
      requestId: 'response-request-error',
      startedAt: Date.now(),
      requestSignal: new AbortController().signal,
      rateLimit,
      telemetryContext,
      requestLogger: logger,
      recordMetrics: () => {},
    },
    { executeProgressively }
  );

  const chunks = await readNdjson(response);
  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['meta', 'error']
  );
  assert.equal(chunks[1]?.requestId, 'response-request-error');
  assert.equal(chunks[1]?.error, 'Failed to fetch feeds');
  assert.equal(entries.find((entry) => entry.level === 'error')?.context?.event, 'feed_api_stream_failed');
});

test('error Feed responses preserve Request ID and optional rate-limit headers', async () => {
  const response = createFeedErrorResponse(
    { error: 'Invalid JSON request body' },
    400,
    'response-request-error',
    rateLimit
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers.get('X-Request-Id'), 'response-request-error');
  assert.equal(response.headers.get('X-RateLimit-Limit'), '60');
  assert.deepEqual(await response.json(), { error: 'Invalid JSON request body' });
});
