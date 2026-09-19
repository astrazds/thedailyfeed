import { checkApiRateLimit, type ApiRateLimitResult } from './api-rate-limit';
import { MAX_FEED_JSON_BODY_BYTES } from './constants';
import { createFeedErrorResponse } from './feed-response-adapter';
import {
  deriveRequestContext,
  type RequestContext,
  type RequestContextPolicy,
} from './request-context';
import type { LogContext } from './logger';

const RATE_LIMIT_ERROR = 'Too many requests. Please try again later.';

export const defaultFeedRouteRequestContextPolicy = {
  trustedClientIdentityHeaders: [],
} satisfies RequestContextPolicy;

export interface FeedRouteAdmissionPolicy {
  event: string;
  method: string;
  rateLimitEvent: string;
  route: string;
  requestContextPolicy?: RequestContextPolicy;
}

export interface FeedRouteAdmissionDependencies {
  checkRateLimit?: (context: RequestContext) => ApiRateLimitResult;
}

export interface FeedRouteAdmission {
  requestContext: RequestContext;
  requestId: string;
  rateLimit: ApiRateLimitResult;
  loggerFacts: LogContext;
  rateLimitLogFacts: LogContext;
  createRateLimitedResponse(): Response;
}

function createLoggerFacts(
  policy: FeedRouteAdmissionPolicy,
  requestContext: RequestContext
): LogContext {
  return {
    event: policy.event,
    method: policy.method,
    requestId: requestContext.requestId,
    route: policy.route,
  };
}

function createRateLimitLogFacts(
  policy: FeedRouteAdmissionPolicy,
  rateLimit: ApiRateLimitResult
): LogContext {
  return {
    event: policy.rateLimitEvent,
    retryAfter: rateLimit.retryAfter,
  };
}

export function createOversizedFeedJsonResponse(
  request: Request,
  requestId: string,
  rateLimit?: ApiRateLimitResult
): Response | null {
  const header = request.headers.get('content-length');
  if (header === null) {
    return null;
  }

  const length = Number.parseInt(header, 10);
  if (!Number.isFinite(length) || length < 0 || length <= MAX_FEED_JSON_BODY_BYTES) {
    return null;
  }

  return createFeedErrorResponse(
    { error: 'Request body too large.' },
    413,
    requestId,
    rateLimit
  );
}

export function admitFeedRouteRequest(
  request: Request,
  policy: FeedRouteAdmissionPolicy,
  dependencies: FeedRouteAdmissionDependencies = {}
): FeedRouteAdmission {
  const requestContext = deriveRequestContext(
    request,
    policy.requestContextPolicy ?? defaultFeedRouteRequestContextPolicy
  );
  const rateLimit = (dependencies.checkRateLimit ?? checkApiRateLimit)(requestContext);
  const requestId = requestContext.requestId;

  return {
    requestContext,
    requestId,
    rateLimit,
    loggerFacts: createLoggerFacts(policy, requestContext),
    rateLimitLogFacts: createRateLimitLogFacts(policy, rateLimit),
    createRateLimitedResponse() {
      return createFeedErrorResponse(
        {
          error: RATE_LIMIT_ERROR,
          retryAfter: rateLimit.retryAfter,
        },
        429,
        requestId,
        rateLimit,
        {
          'Retry-After': String(rateLimit.retryAfter),
        }
      );
    },
  };
}
