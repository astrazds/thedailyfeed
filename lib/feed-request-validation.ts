import { normalizeTimeZone } from './date-utils';
import { MAX_FEEDS_PER_REQUEST } from './constants';
import { isValidFeedUrl } from './url-validator';

export interface ValidatedFeedSet {
  feedUrls: string[];
  timeZone: string;
  originalFeedCount: number;
  uniqueFeedCount: number;
  duplicateFeedCount: number;
}

export interface ValidatedFeedRequest {
  feedSet: ValidatedFeedSet;
}

export interface ValidatedSingleFeedUrl {
  url: string;
}

export interface FeedRequestValidationError {
  error: string;
  reason: string;
  invalidUrlCount?: number;
  maxFeedsPerRequest?: number;
}

type FeedRequestValidationResult =
  | { ok: true; value: ValidatedFeedRequest }
  | { ok: false; status: 400; details: FeedRequestValidationError };

type SingleFeedUrlValidationResult =
  | { ok: true; value: ValidatedSingleFeedUrl }
  | { ok: false; status: 400; details: FeedRequestValidationError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeFeedUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  parsed.hash = '';
  const normalized = parsed.href;
  return isValidFeedUrl(normalized) ? normalized : null;
}

export function validateFeedRequestBody(body: unknown): FeedRequestValidationResult {
  if (!isRecord(body) || !('feedUrls' in body)) {
    return {
      ok: false,
      status: 400,
      details: {
        error: 'Invalid request body. Expected { feedUrls: string[] }',
        reason: 'missing_feed_urls',
      },
    };
  }

  const feedUrls = body.feedUrls;
  if (!Array.isArray(feedUrls)) {
    return {
      ok: false,
      status: 400,
      details: {
        error: 'feedUrls must be an array',
        reason: 'feed_urls_not_array',
      },
    };
  }

  if (feedUrls.length === 0) {
    return {
      ok: false,
      status: 400,
      details: {
        error: 'No feed URLs provided',
        reason: 'empty_feed_urls',
      },
    };
  }

  if (feedUrls.length > MAX_FEEDS_PER_REQUEST) {
    return {
      ok: false,
      status: 400,
      details: {
        error: `Too many feeds. Maximum ${MAX_FEEDS_PER_REQUEST} feeds allowed.`,
        reason: 'too_many_feeds',
        maxFeedsPerRequest: MAX_FEEDS_PER_REQUEST,
      },
    };
  }

  const normalizedFeedUrls: string[] = [];
  const seen = new Set<string>();
  let invalidUrlCount = 0;

  for (const feedUrl of feedUrls) {
    if (typeof feedUrl !== 'string') {
      invalidUrlCount += 1;
      continue;
    }

    const normalized = normalizeFeedUrl(feedUrl);
    if (!normalized) {
      invalidUrlCount += 1;
      continue;
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      normalizedFeedUrls.push(normalized);
    }
  }

  if (invalidUrlCount > 0) {
    return {
      ok: false,
      status: 400,
      details: {
        error: 'Invalid feed URLs provided',
        reason: 'invalid_feed_urls',
        invalidUrlCount,
      },
    };
  }

  return {
    ok: true,
    value: {
      feedSet: {
        feedUrls: normalizedFeedUrls,
        timeZone: normalizeTimeZone(typeof body.timeZone === 'string' ? body.timeZone : undefined),
        originalFeedCount: feedUrls.length,
        uniqueFeedCount: normalizedFeedUrls.length,
        duplicateFeedCount: feedUrls.length - normalizedFeedUrls.length,
      },
    },
  };
}

export function validateSingleFeedUrlBody(body: unknown): SingleFeedUrlValidationResult {
  if (!isRecord(body) || !('url' in body)) {
    return {
      ok: false,
      status: 400,
      details: {
        error: 'Invalid request body. Expected { url: string }',
        reason: 'missing_url',
      },
    };
  }

  if (typeof body.url !== 'string' || !body.url.trim()) {
    return {
      ok: false,
      status: 400,
      details: {
        error: 'Feed URL is required',
        reason: 'empty_url',
      },
    };
  }

  const normalized = normalizeFeedUrl(body.url);
  if (!normalized) {
    return {
      ok: false,
      status: 400,
      details: {
        error: 'Invalid feed URL. Only HTTP and HTTPS URLs are allowed.',
        reason: 'invalid_url',
      },
    };
  }

  return {
    ok: true,
    value: {
      url: normalized,
    },
  };
}
