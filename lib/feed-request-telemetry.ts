import type { FeedRequestMetrics, FeedRequestOutcome } from './feed-request';
import type { ValidatedFeedSet } from './feed-request-validation';
import type { LogContext } from './logger';

export interface FeedRequestTelemetryFeedSetFacts {
  feedCount: number;
  uniqueFeedCount: number;
  duplicateFeedCount: number;
  timeZone: string;
}

export interface FeedRequestTelemetryContextFacts extends FeedRequestTelemetryFeedSetFacts {
  remainingRateLimit: number;
}

export interface FeedRequestTelemetryContext {
  feedSet: ValidatedFeedSet;
  remainingRateLimit: number;
}

export type FeedRequestTelemetryMode = 'json' | 'stream';

export interface FeedRequestTelemetryLogger {
  info(message: string, context?: LogContext): void;
}

export interface RecordFeedRequestTelemetryInput {
  mode: FeedRequestTelemetryMode;
  outcome: FeedRequestOutcome;
  requestContext: FeedRequestTelemetryContext;
  requestLogger: FeedRequestTelemetryLogger;
  recordMetrics: (metrics: FeedRequestMetrics) => void;
}

const completionMessages: Record<FeedRequestTelemetryMode, string> = {
  json: 'Feed API request completed (json fetch)',
  stream: 'Feed API request completed (streamed fetch)',
};

export function getFeedRequestTelemetryFeedSetFacts(
  feedSet: ValidatedFeedSet
): FeedRequestTelemetryFeedSetFacts {
  return {
    feedCount: feedSet.originalFeedCount,
    uniqueFeedCount: feedSet.uniqueFeedCount,
    duplicateFeedCount: feedSet.duplicateFeedCount,
    timeZone: feedSet.timeZone,
  };
}

export function getFeedRequestTelemetryContextFacts(
  requestContext: FeedRequestTelemetryContext
): FeedRequestTelemetryContextFacts {
  return {
    ...getFeedRequestTelemetryFeedSetFacts(requestContext.feedSet),
    remainingRateLimit: requestContext.remainingRateLimit,
  };
}

export function getFeedRequestTelemetryFacts(
  outcome: FeedRequestOutcome,
  requestContext: FeedRequestTelemetryContext
): LogContext {
  return {
    event: 'feed_api_request_complete',
    ...getFeedRequestTelemetryContextFacts(requestContext),
    requestId: outcome.requestId,
    cached: outcome.cached,
    durationMs: outcome.metrics.durationMs,
    parseDurationMs: outcome.metrics.parseDurationMs,
    returnedItemCount: outcome.items.length,
    cachedFeedCount: outcome.cachedFeedCount,
    fetchedFeedCount: outcome.fetchedFeedCount,
    timedOutFeedCount: outcome.timedOutFeedCount,
    failedFeedCount: outcome.failedFeedCount,
  };
}

export function recordFeedRequestTelemetry({
  mode,
  outcome,
  requestContext,
  requestLogger,
  recordMetrics,
}: RecordFeedRequestTelemetryInput): void {
  requestLogger.info(completionMessages[mode], getFeedRequestTelemetryFacts(outcome, requestContext));
  recordMetrics(outcome.metrics);
}
