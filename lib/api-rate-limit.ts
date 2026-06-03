import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from './constants';
import {
  checkRateLimit,
  getRateLimitResetTime,
  getRemainingRequests,
} from './rate-limiter';
import type { RequestContext } from './request-context';

export interface ApiRateLimitResult {
  allowed: boolean;
  identifier: string;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter: number;
}

export function getRateLimitIdentity(context: RequestContext): string {
  return context.clientIdentity.value;
}

export function checkApiRateLimit(context: RequestContext): ApiRateLimitResult {
  const identifier = getRateLimitIdentity(context);
  const allowed = checkRateLimit(identifier, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  const resetTime = getRateLimitResetTime(identifier);
  const remaining = allowed ? getRemainingRequests(identifier, RATE_LIMIT_MAX_REQUESTS) : 0;

  return {
    allowed,
    identifier,
    limit: RATE_LIMIT_MAX_REQUESTS,
    remaining,
    resetTime,
    retryAfter: Math.max(0, Math.ceil((resetTime - Date.now()) / 1000)),
  };
}

export function getRateLimitHeaders(result: ApiRateLimitResult): HeadersInit {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
  };
}
