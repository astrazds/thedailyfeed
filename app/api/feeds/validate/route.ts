import { NextResponse } from 'next/server';
import {
  getRateLimitHeaders,
  type ApiRateLimitResult,
} from '@/lib/api-rate-limit';
import {
  admitFeedRouteRequest,
  type FeedRouteAdmissionPolicy,
} from '@/lib/feed-api-admission';
import { createFeedErrorResponse } from '@/lib/feed-response-adapter';
import { validateSingleFeedUrlBody } from '@/lib/feed-request-validation';
import { parseFeedWithRetry } from '@/lib/rss';
import { logger } from '@/lib/logger';
import { applyRequestIdHeader } from '@/lib/request-context';
import { createFeedOperationSignal } from '@/lib/feed-operation-budget';

export const dynamic = 'force-dynamic';

const VALIDATE_ROUTE = '/api/feeds/validate';
const VALIDATE_ROUTE_ADMISSION = {
  event: 'feed_validation_request',
  method: 'POST',
  rateLimitEvent: 'feed_validation_rate_limited',
  route: VALIDATE_ROUTE,
} satisfies FeedRouteAdmissionPolicy;

function jsonResponse(
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
  return applyRequestIdHeader(response, requestId);
}

export async function POST(request: Request) {
  const admission = admitFeedRouteRequest(request, VALIDATE_ROUTE_ADMISSION);
  const requestId = admission.requestId;
  const rateLimit = admission.rateLimit;
  const requestLogger = logger.child(admission.loggerFacts);

  if (!rateLimit.allowed) {
    requestLogger.warn('Rate limit exceeded', admission.rateLimitLogFacts);
    return admission.createRateLimitedResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    requestLogger.warn('Invalid JSON request body', {
      event: 'feed_validation_failed',
      reason: 'invalid_json',
    });
    return createFeedErrorResponse({ error: 'Invalid JSON request body' }, 400, requestId, rateLimit);
  }

  const validation = validateSingleFeedUrlBody(body);
  if (!validation.ok) {
    requestLogger.warn('Feed validation request failed validation', {
      event: 'feed_validation_failed',
      reason: validation.details.reason,
    });

    return createFeedErrorResponse({ error: validation.details.error }, validation.status, requestId, rateLimit);
  }

  const { url } = validation.value;
  const signal = createFeedOperationSignal(request.signal);

  try {
    const parsedItems = await parseFeedWithRetry(
      url,
      1,
      500,
      logger.child({ subsystem: 'feed_validation' }),
      { signal }
    );
    const sourceName = parsedItems[0]?.source || new URL(url).hostname;

    return jsonResponse(
      {
        valid: true,
        source: sourceName,
        sampleItemCount: parsedItems.length,
      },
      200,
      requestId,
      rateLimit
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown feed validation error');
    requestLogger.warn('Feed validation failed', {
      event: 'feed_validation_failed',
      feedHost: new URL(url).hostname,
      errorMessage: err.message,
    });
    return createFeedErrorResponse(
      { error: 'Unable to parse this feed URL. Please verify it is a valid RSS/Atom feed.' },
      400,
      requestId,
      rateLimit
    );
  }
}
