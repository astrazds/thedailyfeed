import { NextResponse } from 'next/server';
import { getFeedApiMetrics } from '@/lib/metrics';
import { getCacheStats } from '@/lib/feed-cache';
import { applyRequestIdHeader, deriveRequestContext } from '@/lib/request-context';
import { metricsExposurePolicy } from '@/lib/metrics-exposure-policy';
import { authorizeMetricsRequest } from '@/lib/metrics-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestContext = deriveRequestContext(request);
  const access = authorizeMetricsRequest(request);

  if (!access.allowed) {
    const response = NextResponse.json(
      { error: access.status === 401 ? 'Unauthorized' : 'Not found' },
      {
        status: access.status,
        headers: {
          'Cache-Control': metricsExposurePolicy.cacheControl,
          ...(access.headers || {}),
        },
      }
    );
    return applyRequestIdHeader(response, requestContext.requestId);
  }

  const response = NextResponse.json({
    metricsExposure: metricsExposurePolicy,
    feedApi: getFeedApiMetrics(),
    feedCache: getCacheStats(),
  });

  response.headers.set('Cache-Control', metricsExposurePolicy.cacheControl);
  return applyRequestIdHeader(response, requestContext.requestId);
}
