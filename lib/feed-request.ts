import { FEED_OVERALL_TIMEOUT_MS, FEED_REQUEST_TIMEOUT_MS } from './constants';
import { cacheFeed, getCachedFeedSplit } from './feed-cache';
import { filterTodayItems, parseFeedsProgressively, sortByDate, type FeedItem } from './rss';
import type { ValidatedFeedSet } from './feed-request-validation';
import type { ProgressiveFeedParseResult } from './rss';
import type { FeedProgressEvent } from './types';

type FeedCacheSplit = ReturnType<typeof getCachedFeedSplit>;

export interface FeedRequestInput {
  feedSet: ValidatedFeedSet;
  requestId: string;
  todayReferenceDate?: Date;
  startedAt?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface FeedRequestMetrics {
  requestId: string;
  cached: boolean;
  durationMs: number;
  parseDurationMs: number;
  itemCount: number;
  feedCount: number;
  completedFeedCount: number;
  timeoutFeedCount: number;
  errorFeedCount: number;
}

export interface FeedRequestOutcome {
  requestId: string;
  items: FeedItem[];
  cached: boolean;
  timeZone: string;
  cachedFeedCount: number;
  fetchedFeedCount: number;
  timedOutFeedCount: number;
  failedFeedCount: number;
  metrics: FeedRequestMetrics;
}

type FeedRequestEvent = FeedProgressEvent<FeedItem>;

export type FeedRequestProgressEvent = FeedRequestEvent extends infer Event
  ? Event extends { type: 'done' }
    ? Event & { outcome: FeedRequestOutcome }
    : Event
  : never;

export interface FeedRequestDependencies {
  now?: () => number;
  getCachedFeedSplit?: (feedUrls: string[]) => FeedCacheSplit;
  cacheFeed?: (feedUrl: string, items: FeedItem[]) => void;
  parseFeedsProgressively?: (
    feedUrls: string[],
    options: {
      overallTimeoutMs?: number;
      signal?: AbortSignal;
      requestId?: string;
    }
  ) => AsyncGenerator<ProgressiveFeedParseResult>;
}

const defaultDependencies = {
  now: () => Date.now(),
  getCachedFeedSplit,
  cacheFeed,
  parseFeedsProgressively,
};

interface RequestBudgetSignal {
  signal: AbortSignal;
  dispose: () => void;
}

function filterAndSortToday(items: FeedItem[], timeZone: string, referenceDate: Date): FeedItem[] {
  return sortByDate(filterTodayItems(items, timeZone, referenceDate));
}

function createRequestBudgetSignal(
  inputSignal: AbortSignal | undefined,
  timeoutMs: number
): RequestBudgetSignal {
  const controller = new AbortController();
  const abortFromInput = () => controller.abort(inputSignal?.reason);
  const timeout = setTimeout(() => {
    controller.abort(new Error('Feed request timed out.'));
  }, timeoutMs);

  if (inputSignal?.aborted) {
    abortFromInput();
  } else {
    inputSignal?.addEventListener('abort', abortFromInput, { once: true });
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      inputSignal?.removeEventListener('abort', abortFromInput);
    },
  };
}

export async function executeFeedRequest(
  input: FeedRequestInput,
  dependencies: FeedRequestDependencies = {}
): Promise<FeedRequestOutcome> {
  let outcome: FeedRequestOutcome | null = null;
  for await (const event of executeFeedRequestProgressively(input, dependencies)) {
    if (event.type === 'done') {
      outcome = event.outcome;
    }
  }

  if (!outcome) {
    throw new Error('Feed request completed without an outcome');
  }

  return outcome;
}

export async function* executeFeedRequestProgressively(
  input: FeedRequestInput,
  dependencies: FeedRequestDependencies = {}
): AsyncGenerator<FeedRequestProgressEvent> {
  const deps = { ...defaultDependencies, ...dependencies };
  const startedAt = input.startedAt ?? deps.now();
  const todayReferenceDate = input.todayReferenceDate
    ? new Date(input.todayReferenceDate.getTime())
    : new Date(startedAt);
  const { cached, missing } = deps.getCachedFeedSplit(input.feedSet.feedUrls);
  const allCached = missing.length === 0;
  const totalFeeds = cached.length + missing.length;
  const aggregatedItems: FeedItem[] = [];
  const parseStartedAt = allCached ? startedAt : deps.now();
  const fetched: Array<{ feedUrl: string; items: FeedItem[]; status: ProgressiveFeedParseResult['status'] }> = [];
  let completedFeeds = 0;

  yield {
    type: 'meta',
    requestId: input.requestId,
    cached: allCached,
    timeZone: input.feedSet.timeZone,
    totalFeeds,
    completedFeeds: 0,
  };

  for (const cachedFeed of cached) {
    completedFeeds += 1;
    const todayItems = filterAndSortToday(cachedFeed.items, input.feedSet.timeZone, todayReferenceDate);
    aggregatedItems.push(...todayItems);

    yield {
      type: 'feed_result',
      requestId: input.requestId,
      cached: allCached,
      timeZone: input.feedSet.timeZone,
      totalFeeds,
      completedFeeds,
      feedUrl: cachedFeed.feedUrl,
      status: 'cached',
      itemCount: todayItems.length,
      items: todayItems,
    };
  }

  if (missing.length > 0) {
    const requestBudget = createRequestBudgetSignal(
      input.signal,
      input.requestTimeoutMs ?? FEED_REQUEST_TIMEOUT_MS
    );

    try {
      for await (const feedResult of deps.parseFeedsProgressively(missing, {
        overallTimeoutMs: FEED_OVERALL_TIMEOUT_MS,
        requestId: input.requestId,
        signal: requestBudget.signal,
      })) {
        completedFeeds += 1;
        fetched.push(feedResult);
        if (feedResult.status === 'success') {
          deps.cacheFeed(feedResult.feedUrl, feedResult.items);
        }
        const todayItems = filterAndSortToday(feedResult.items, input.feedSet.timeZone, todayReferenceDate);
        aggregatedItems.push(...todayItems);

        yield {
          type: 'feed_result',
          requestId: input.requestId,
          cached: allCached,
          timeZone: input.feedSet.timeZone,
          totalFeeds,
          completedFeeds,
          feedUrl: feedResult.feedUrl,
          status: feedResult.status,
          itemCount: todayItems.length,
          items: todayItems,
        };
      }
    } finally {
      requestBudget.dispose();
    }
  }

  const items = sortByDate(aggregatedItems);
  const timedOutFeedCount = fetched.filter((entry) => entry.status === 'timeout').length;
  const failedFeedCount = fetched.filter((entry) => entry.status === 'error').length;
  const completedFeedCount = cached.length + fetched.length;
  const durationMs = deps.now() - startedAt;
  const parseDurationMs = allCached ? 0 : deps.now() - parseStartedAt;

  const outcome = {
    requestId: input.requestId,
    items,
    cached: allCached,
    timeZone: input.feedSet.timeZone,
    cachedFeedCount: cached.length,
    fetchedFeedCount: fetched.length,
    timedOutFeedCount,
    failedFeedCount,
    metrics: {
      requestId: input.requestId,
      cached: allCached,
      durationMs,
      parseDurationMs,
      itemCount: items.length,
      feedCount: input.feedSet.originalFeedCount,
      completedFeedCount,
      timeoutFeedCount: timedOutFeedCount,
      errorFeedCount: failedFeedCount,
    },
  };

  yield {
    type: 'done',
    requestId: input.requestId,
    cached: allCached,
    timeZone: input.feedSet.timeZone,
    totalFeeds,
    completedFeeds,
    totalItemCount: items.length,
    outcome,
  };
}
