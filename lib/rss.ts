import Parser from 'rss-parser';
import { parseISO, isValid } from 'date-fns';
import { logger } from './logger';
import { getDayKeyForTimeZone } from './date-utils';
import {
  FEED_RETRY_COUNT,
  FEED_RETRY_DELAY_MS,
  FEED_OVERALL_TIMEOUT_MS,
} from './constants';
import { FeedTimeoutError, fetchFeedXml, isAbortError } from './feed-fetcher';
import { normalizeSafeArticleLink } from './feed-link-policy';

export interface FeedItem {
  title: string;
  link: string;
  pubDate: Date;
  description?: string;
  contentHtml?: string;
  source: string;
}

interface ParseFeedsOptions {
  overallTimeoutMs?: number;
  signal?: AbortSignal;
  concurrency?: number;
  requestId?: string;
}

interface ParseFeedOptions {
  signal?: AbortSignal;
}

export interface ProgressiveFeedParseResult {
  feedUrl: string;
  items: FeedItem[];
  durationMs: number;
  status: 'success' | 'timeout' | 'error';
}

/**
 * Decode HTML entities in text
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#8216;': '\u2018',
    '&#8217;': '\u2019',
    '&#8220;': '\u201C',
    '&#8221;': '\u201D',
    '&#8211;': '\u2013',
    '&#8212;': '\u2014',
  };
  
  return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
}

const parser = new Parser();

/**
 * Parse a single RSS feed and return items
 */
export async function parseFeed(
  feedUrl: string,
  requestLogger = logger,
  options: ParseFeedOptions = {}
): Promise<FeedItem[]> {
  try {
    const feedXml = await fetchFeedXml(feedUrl, {
      signal: options.signal,
    });
    const feed = await parser.parseString(feedXml);
    const sourceName = feed.title || new URL(feedUrl).hostname;

    const items: FeedItem[] = [];
    
    for (const item of feed.items || []) {
      const itemDate = item.isoDate || item.pubDate;
      if (!itemDate) continue;

      const pubDate = item.isoDate ? parseISO(item.isoDate) : new Date(itemDate);
      
      // Validate date is valid
      if (!isValid(pubDate)) {
        requestLogger.warn('Skipping item with invalid date', {
          feedUrl,
          source: sourceName,
          title: item.title || 'Untitled',
          itemDate,
          event: 'rss_item_invalid_date',
        });
        continue;
      }
      
      items.push({
        title: decodeHtmlEntities(item.title || 'Untitled'),
        link: normalizeSafeArticleLink(item.link || ''),
        pubDate,
        description: item.contentSnippet,
        contentHtml: item.content || item['content:encoded'],
        source: sourceName,
      });
    }
    
    return items;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    requestLogger.warn('Failed to parse feed', {
      event: 'rss_feed_parse_error',
      feedUrl,
      errorMessage: err.message,
    });
    throw err;
  }
}

/**
 * Parse a single RSS feed with retry logic
 */
export async function parseFeedWithRetry(
  feedUrl: string,
  maxRetries: number = FEED_RETRY_COUNT,
  retryDelay: number = FEED_RETRY_DELAY_MS,
  requestLogger = logger,
  options: ParseFeedOptions = {}
): Promise<FeedItem[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    throwIfAborted(options.signal);

    try {
      const items = await parseFeed(feedUrl, requestLogger, options);
      if (attempt > 0) {
        requestLogger.info('Feed recovered after retry', {
          event: 'rss_feed_recovered_after_retry',
          feedUrl,
          attemptsUsed: attempt + 1,
          maxAttempts: maxRetries + 1,
          itemCount: items.length,
        });
      }

      return items;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (isAbortError(err) || (err instanceof FeedTimeoutError && options.signal?.aborted)) {
        throw err;
      }

      lastError = err;
      requestLogger.warn('Feed fetch attempt failed', {
        feedUrl,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
        errorMessage: err.message,
        event: 'rss_feed_retry_attempt_failed',
      });
      
      // Don't delay after last attempt
      if (attempt < maxRetries) {
        await abortableDelay(retryDelay * (attempt + 1), options.signal);
      }
    }
  }
  
  requestLogger.error('All retry attempts failed for feed', lastError || undefined, {
    event: 'rss_feed_retry_exhausted',
    feedUrl,
    maxAttempts: maxRetries + 1,
  });

  throw lastError || new Error('Feed parsing failed after retries');
}

/**
 * Parse multiple feeds and yield results as each feed completes.
 */
export async function* parseFeedsProgressively(
  feedUrls: string[],
  options: ParseFeedsOptions = {}
): AsyncGenerator<ProgressiveFeedParseResult> {
  const {
    overallTimeoutMs = FEED_OVERALL_TIMEOUT_MS,
    concurrency = 4,
    signal,
    requestId,
  } = options;
  const parseStartedAt = Date.now();
  const parseAbortController = new AbortController();
  const abortSignal = signal
    ? AbortSignal.any([signal, parseAbortController.signal])
    : parseAbortController.signal;
  const parseLogger = requestId
    ? logger.child({ requestId, subsystem: 'rss' })
    : logger.child({ subsystem: 'rss' });

  parseLogger.info('Progressive RSS parsing started', {
    event: 'rss_progressive_parse_start',
    feedCount: feedUrls.length,
    overallTimeoutMs,
  });

  const pending = new Map<number, Promise<{ index: number; result: ProgressiveFeedParseResult }>>();
  const effectiveConcurrency = Math.max(1, Math.min(concurrency, feedUrls.length || 1));
  let nextIndex = 0;

  const startFeed = (index: number) => {
    const url = feedUrls[index];
    const task = (async (): Promise<ProgressiveFeedParseResult> => {
      const feedLogger = parseLogger.child({ feedUrl: url });
      const feedStartedAt = Date.now();

      try {
        const items = await withTimeout(
          (timeoutSignal) => parseFeedWithRetry(url, FEED_RETRY_COUNT, FEED_RETRY_DELAY_MS, feedLogger, {
            signal: timeoutSignal,
          }),
          overallTimeoutMs,
          abortSignal
        );

        const durationMs = Date.now() - feedStartedAt;
        feedLogger.info('RSS feed parsed', {
          event: 'rss_feed_parse_complete',
          durationMs,
          itemCount: items.length,
        });

        return {
          feedUrl: url,
          items,
          durationMs,
          status: 'success',
        };
      } catch (error) {
        const durationMs = Date.now() - feedStartedAt;
        if (error instanceof FeedTimeoutError) {
          feedLogger.warn('Feed timed out, skipping source', {
            event: 'rss_feed_timeout',
            overallTimeoutMs,
            durationMs,
          });
          return {
            feedUrl: url,
            items: [],
            durationMs,
            status: 'timeout',
          };
        }

        if (abortSignal.aborted || isAbortError(error)) {
          return {
            feedUrl: url,
            items: [],
            durationMs,
            status: 'error',
          };
        }

        const err = error instanceof Error ? error : new Error('Unknown feed parsing error');
        feedLogger.error('Unexpected feed parsing failure', err, {
          event: 'rss_feed_parse_failed',
          durationMs,
        });
        return {
          feedUrl: url,
          items: [],
          durationMs,
          status: 'error',
        };
      }
    })();

    pending.set(index, task.then((result) => ({ index, result })));
  };

  while (nextIndex < feedUrls.length && pending.size < effectiveConcurrency && !abortSignal.aborted) {
    startFeed(nextIndex);
    nextIndex += 1;
  }

  while (pending.size > 0) {
    if (abortSignal.aborted) {
      parseLogger.info('Progressive RSS parsing stopped due to abort signal', {
        event: 'rss_progressive_parse_aborted',
        completedFeedCount: feedUrls.length - pending.size,
        totalFeedCount: feedUrls.length,
      });
      parseAbortController.abort();
      return;
    }

    let next: { index: number; result: ProgressiveFeedParseResult };
    try {
      next = await Promise.race([
        ...pending.values(),
        abortSignalPromise(abortSignal),
      ]);
    } catch (error) {
      if (abortSignal.aborted || isAbortError(error)) {
        parseLogger.info('Progressive RSS parsing stopped due to abort signal', {
          event: 'rss_progressive_parse_aborted',
          completedFeedCount: feedUrls.length - pending.size,
          totalFeedCount: feedUrls.length,
        });
        parseAbortController.abort();
        return;
      }

      throw error;
    }
    pending.delete(next.index);
    yield next.result;

    while (nextIndex < feedUrls.length && pending.size < effectiveConcurrency && !abortSignal.aborted) {
      startFeed(nextIndex);
      nextIndex += 1;
    }
  }

  parseLogger.info('Progressive RSS parsing completed', {
    event: 'rss_progressive_parse_complete',
    durationMs: Date.now() - parseStartedAt,
    feedCount: feedUrls.length,
  });
}

function createAbortError(): Error {
  const error = new Error('Feed operation aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  if (signal.reason instanceof Error) {
    throw signal.reason;
  }

  throw createAbortError();
}

function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);

    const timeoutId = setTimeout(resolve, delayMs);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(signal.reason instanceof Error ? signal.reason : createAbortError());
    }, {
      once: true,
    });
  });
}

function abortSignalPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    throwIfAborted(signal);
    signal.addEventListener('abort', () => {
      reject(signal.reason instanceof Error ? signal.reason : createAbortError());
    }, {
      once: true,
    });
  });
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutController = new AbortController();
  const signal = parentSignal
    ? AbortSignal.any([parentSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    timeoutId = setTimeout(() => {
      timeoutController.abort(new FeedTimeoutError(timeoutMs));
    }, timeoutMs);

    return await operation(signal);
  } catch (error) {
    if (timeoutController.signal.aborted && timeoutController.signal.reason instanceof FeedTimeoutError) {
      throw timeoutController.signal.reason;
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutController.abort();
  }
}

/**
 * Filter feed items to only those published today
 */
export function filterTodayItems(
  items: FeedItem[],
  timeZone: string = 'UTC',
  referenceDate: Date = new Date()
): FeedItem[] {
  const todayKey = getDayKeyForTimeZone(referenceDate, timeZone);
  return items.filter((item) => getDayKeyForTimeZone(item.pubDate, timeZone) === todayKey);
}

/**
 * Sort items by date (newest first)
 */
export function sortByDate(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}
