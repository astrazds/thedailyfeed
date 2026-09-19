import { timingSafeEqual } from 'node:crypto';
import { metricsExposurePolicy } from './metrics-exposure-policy';

interface MetricsAccessAllowed {
  allowed: true;
}

interface MetricsAccessDenied {
  allowed: false;
  status: 401 | 404;
  headers?: HeadersInit;
}

export type MetricsAccessDecision = MetricsAccessAllowed | MetricsAccessDenied;

function bearerTokenMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }

  return timingSafeEqual(left, right);
}

function readBearerToken(headers: Headers): string {
  const authorization = headers.get('authorization')?.trim() || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() || '';
}

export function authorizeMetricsRequest(request: Request): MetricsAccessDecision {
  const configuredToken = process.env.METRICS_AUTH_TOKEN?.trim() || '';
  const requiresToken = process.env.NODE_ENV === 'production' || configuredToken !== '';

  if (!requiresToken) {
    return { allowed: true };
  }

  if (!configuredToken) {
    return { allowed: false, status: 404 };
  }

  if (bearerTokenMatches(readBearerToken(request.headers), configuredToken)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    status: 401,
    headers: {
      'WWW-Authenticate': `Bearer realm="${metricsExposurePolicy.realm}"`,
    },
  };
}
