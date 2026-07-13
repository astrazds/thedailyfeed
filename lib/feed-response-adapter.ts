import { NextResponse } from 'next/server';
import {
  getRateLimitHeaders,
  type ApiRateLimitResult,
} from './api-rate-limit';
import {
  executeFeedRequestProgressively,
  type FeedRequestMetrics,
  type FeedRequestOutcome,
  type FeedRequestProgressEvent,
} from './feed-request';
import {
  recordFeedRequestTelemetry,
  type FeedRequestTelemetryContext,
} from './feed-request-telemetry';
import { serializeFeedItems } from './feed-stream-parser';
import type { LogContext } from './logger';
import { recordFeedApiRequest } from './metrics';
import { applyRequestIdHeader } from './request-context';
import type { ValidatedFeedSet } from './feed-request-validation';
import type { FeedProgressEvent, FeedStreamChunk, SerializedFeedItem } from './types';

const NDJSON_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8';
const STREAM_QUERY_PARAM = 'stream';
const STREAM_QUERY_VALUE = '1';
const DEFAULT_CACHE_CONTROL = 'no-store';

export interface FeedResponseLogger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: unknown, context?: LogContext): void;
}

export interface FeedResponseContext {
  requestId: string;
  rateLimit: ApiRateLimitResult;
  telemetryContext: FeedRequestTelemetryContext;
  requestLogger: FeedResponseLogger;
  recordMetrics?: (metrics: FeedRequestMetrics) => void;
}

export interface CreateFeedStreamResponseInput extends FeedResponseContext {
  feedSet: ValidatedFeedSet;
  startedAt: number;
  requestSignal: AbortSignal;
}

export interface FeedStreamResponseDependencies {
  executeProgressively?: typeof executeFeedRequestProgressively;
}

function withRequestId<T extends Response>(response: T, requestId: string): T {
  return applyRequestIdHeader(response, requestId);
}

function applyStandardHeaders(
  response: Response,
  rateLimit: ApiRateLimitResult,
  requestId: string,
  cacheControl: string = DEFAULT_CACHE_CONTROL
): Response {
  response.headers.set('Cache-Control', cacheControl);
  for (const [header, value] of Object.entries(getRateLimitHeaders(rateLimit))) {
    response.headers.set(header, value);
  }
  return withRequestId(response, requestId);
}

export function wantsFeedStreamResponse(request: Request): boolean {
  const acceptHeader = request.headers.get('accept')?.toLowerCase() || '';
  const acceptWantsNdjson = acceptHeader.includes('application/x-ndjson');
  const streamQuery = new URL(request.url).searchParams.get(STREAM_QUERY_PARAM);
  return acceptWantsNdjson || streamQuery === STREAM_QUERY_VALUE;
}

export function createFeedErrorResponse(
  body: unknown,
  status: number,
  requestId: string,
  rateLimit?: ApiRateLimitResult,
  headers?: HeadersInit
): NextResponse {
  const response = NextResponse.json(body, {
    status,
    headers: {
      ...(rateLimit ? getRateLimitHeaders(rateLimit) : {}),
      ...(headers || {}),
    },
  });

  return withRequestId(response, requestId);
}

export function createFeedJsonResponse(
  outcome: FeedRequestOutcome,
  context: FeedResponseContext
): Response {
  recordFeedRequestTelemetry({
    mode: 'json',
    outcome,
    requestContext: context.telemetryContext,
    requestLogger: context.requestLogger,
    recordMetrics: context.recordMetrics ?? recordFeedApiRequest,
  });

  return applyStandardHeaders(
    NextResponse.json({
      items: outcome.items,
      cached: outcome.cached,
      timeZone: outcome.timeZone,
    }),
    context.rateLimit,
    context.requestId
  );
}

function toFeedStreamChunk(
  event: FeedRequestProgressEvent
): FeedProgressEvent<SerializedFeedItem> {
  if (event.type === 'feed_result') {
    return {
      ...event,
      items: serializeFeedItems(event.items),
    };
  }

  if (event.type === 'done') {
    return {
      type: 'done',
      requestId: event.requestId,
      cached: event.cached,
      timeZone: event.timeZone,
      totalFeeds: event.totalFeeds,
      completedFeeds: event.completedFeeds,
      totalItemCount: event.totalItemCount,
    };
  }

  return event;
}

export function createFeedStreamResponse(
  input: CreateFeedStreamResponseInput,
  dependencies: FeedStreamResponseDependencies = {}
): Response {
  const encoder = new TextEncoder();
  const localAbortController = new AbortController();
  const executeProgressively = dependencies.executeProgressively ?? executeFeedRequestProgressively;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let completedFeeds = 0;
      let totalFeeds = input.feedSet.uniqueFeedCount;
      const abortSignal = AbortSignal.any([input.requestSignal, localAbortController.signal]);

      const enqueueChunk = (chunk: FeedStreamChunk): boolean => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
          return true;
        } catch {
          return false;
        }
      };

      try {
        for await (const event of executeProgressively({
          feedSet: input.feedSet,
          requestId: input.requestId,
          startedAt: input.startedAt,
          signal: abortSignal,
        })) {
          totalFeeds = event.totalFeeds;
          completedFeeds = event.completedFeeds;

          if (abortSignal.aborted) {
            break;
          }

          const didEnqueue = enqueueChunk(toFeedStreamChunk(event));
          if (!didEnqueue) {
            localAbortController.abort();
            input.requestLogger.warn('Feed stream client disconnected', {
              event: 'feed_api_stream_client_disconnected',
              completedFeeds,
              totalFeeds,
            });
            return;
          }

          if (event.type === 'done') {
            recordFeedRequestTelemetry({
              mode: 'stream',
              outcome: event.outcome,
              requestContext: input.telemetryContext,
              requestLogger: input.requestLogger,
              recordMetrics: input.recordMetrics ?? recordFeedApiRequest,
            });
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown feed stream error');
        input.requestLogger.error('Failed to stream feeds', err, {
          event: 'feed_api_stream_failed',
          durationMs: Date.now() - input.startedAt,
          completedFeeds,
          totalFeeds,
        });
        enqueueChunk({
          type: 'error',
          requestId: input.requestId,
          error: 'Failed to fetch feeds',
        });
      } finally {
        localAbortController.abort();
        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      }
    },
    cancel(reason) {
      localAbortController.abort(reason);
      input.requestLogger.warn('Feed stream cancelled by client', {
        event: 'feed_api_stream_cancelled',
      });
    },
  });

  return applyStandardHeaders(
    new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': NDJSON_CONTENT_TYPE,
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    }),
    input.rateLimit,
    input.requestId
  );
}
