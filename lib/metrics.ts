interface FeedApiMetrics {
  startedAt: number;
  totalRequests: number;
  cachedRequests: number;
  uncachedRequests: number;
  totalItemsReturned: number;
  totalFeedsRequested: number;
  totalFeedsCompleted: number;
  totalTimeoutFeeds: number;
  totalErrorFeeds: number;
  totalDurationMs: number;
  totalParseDurationMs: number;
}

interface RecordFeedApiRequestInput {
  requestId: string;
  cached: boolean;
  durationMs: number;
  parseDurationMs: number;
  itemCount: number;
  feedCount: number;
  completedFeedCount: number;
  timeoutFeedCount?: number;
  errorFeedCount?: number;
}

const feedApiMetrics: FeedApiMetrics = {
  startedAt: Date.now(),
  totalRequests: 0,
  cachedRequests: 0,
  uncachedRequests: 0,
  totalItemsReturned: 0,
  totalFeedsRequested: 0,
  totalFeedsCompleted: 0,
  totalTimeoutFeeds: 0,
  totalErrorFeeds: 0,
  totalDurationMs: 0,
  totalParseDurationMs: 0,
};

export function recordFeedApiRequest(input: RecordFeedApiRequestInput): void {
  feedApiMetrics.totalRequests += 1;
  if (input.cached) {
    feedApiMetrics.cachedRequests += 1;
  } else {
    feedApiMetrics.uncachedRequests += 1;
  }

  feedApiMetrics.totalItemsReturned += input.itemCount;
  feedApiMetrics.totalFeedsRequested += input.feedCount;
  feedApiMetrics.totalFeedsCompleted += input.completedFeedCount;
  feedApiMetrics.totalTimeoutFeeds += input.timeoutFeedCount || 0;
  feedApiMetrics.totalErrorFeeds += input.errorFeedCount || 0;
  feedApiMetrics.totalDurationMs += input.durationMs;
  feedApiMetrics.totalParseDurationMs += input.parseDurationMs;
}

export function getFeedApiMetrics() {
  const requestCount = Math.max(1, feedApiMetrics.totalRequests);
  return {
    startedAt: new Date(feedApiMetrics.startedAt).toISOString(),
    uptimeMs: Date.now() - feedApiMetrics.startedAt,
    totalRequests: feedApiMetrics.totalRequests,
    cachedRequests: feedApiMetrics.cachedRequests,
    uncachedRequests: feedApiMetrics.uncachedRequests,
    cacheHitRate: feedApiMetrics.cachedRequests / requestCount,
    avgDurationMs: feedApiMetrics.totalDurationMs / requestCount,
    avgParseDurationMs: feedApiMetrics.totalParseDurationMs / requestCount,
    avgItemsPerRequest: feedApiMetrics.totalItemsReturned / requestCount,
    avgFeedsRequested: feedApiMetrics.totalFeedsRequested / requestCount,
    avgFeedsCompleted: feedApiMetrics.totalFeedsCompleted / requestCount,
    totalTimeoutFeeds: feedApiMetrics.totalTimeoutFeeds,
    totalErrorFeeds: feedApiMetrics.totalErrorFeeds,
  };
}
