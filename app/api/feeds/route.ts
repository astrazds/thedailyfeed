import {
  admitFeedRouteRequest,
  type FeedRouteAdmissionPolicy,
} from '@/lib/feed-api-admission';
import { executeFeedRequest } from '@/lib/feed-request';
import {
  getFeedRequestTelemetryContextFacts,
  type FeedRequestTelemetryContext,
} from '@/lib/feed-request-telemetry';
import { validateFeedRequestBody } from '@/lib/feed-request-validation';
import {
  createFeedErrorResponse,
  createFeedJsonResponse,
  createFeedStreamResponse,
  wantsFeedStreamResponse,
} from '@/lib/feed-response-adapter';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const FEEDS_ROUTE = '/api/feeds';
const FEEDS_ROUTE_ADMISSION = {
  event: 'feed_api_request',
  method: 'POST',
  rateLimitEvent: 'feed_api_rate_limited',
  route: FEEDS_ROUTE,
} satisfies FeedRouteAdmissionPolicy;

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const admission = admitFeedRouteRequest(request, FEEDS_ROUTE_ADMISSION);
  const requestId = admission.requestId;
  const requestLogger = logger.child(admission.loggerFacts);

  requestLogger.info('Feed API request started');

  try {
    const rateLimit = admission.rateLimit;

    if (!rateLimit.allowed) {
      requestLogger.warn('Rate limit exceeded', admission.rateLimitLogFacts);
      return admission.createRateLimitedResponse();
    }

    const wantsStreaming = wantsFeedStreamResponse(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      requestLogger.warn('Invalid JSON request body', {
        event: 'feed_api_validation_failed',
        reason: 'invalid_json',
      });

      return createFeedErrorResponse({ error: 'Invalid JSON request body' }, 400, requestId);
    }

    const validation = validateFeedRequestBody(body);
    if (!validation.ok) {
      const errorBody: Record<string, unknown> = { error: validation.details.error };
      if (validation.details.invalidUrlCount !== undefined) {
        errorBody.invalidUrlCount = validation.details.invalidUrlCount;
      }
      if (validation.details.maxFeedsPerRequest !== undefined) {
        errorBody.maxFeedsPerRequest = validation.details.maxFeedsPerRequest;
      }

      requestLogger.warn('Feed request validation failed', {
        event: 'feed_api_validation_failed',
        reason: validation.details.reason,
        invalidUrlCount: validation.details.invalidUrlCount,
        maxFeedsPerRequest: validation.details.maxFeedsPerRequest,
      });

      return createFeedErrorResponse(errorBody, validation.status, requestId);
    }

    const { feedSet } = validation.value;
    const feedRequestContext: FeedRequestTelemetryContext = {
      feedSet,
      remainingRateLimit: rateLimit.remaining,
    };

    if (wantsStreaming) {
      requestLogger.info('Feed API streaming enabled', {
        event: 'feed_api_stream_enabled',
        ...getFeedRequestTelemetryContextFacts(feedRequestContext),
      });

      return createFeedStreamResponse({
        feedSet,
        requestId,
        startedAt,
        telemetryContext: feedRequestContext,
        requestSignal: request.signal,
        rateLimit,
        requestLogger,
      });
    }

    const outcome = await executeFeedRequest({
      feedSet,
      requestId,
      startedAt,
      signal: request.signal,
    });

    return createFeedJsonResponse(outcome, {
      requestId,
      rateLimit,
      telemetryContext: feedRequestContext,
      requestLogger,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown feed API error');
    requestLogger.error('Failed to fetch feeds', err, {
      event: 'feed_api_request_failed',
      durationMs: Date.now() - startedAt,
    });

    const message = err.message;
    return createFeedErrorResponse(
      {
        error: 'Failed to fetch feeds',
        details: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      500,
      requestId
    );
  }
}
