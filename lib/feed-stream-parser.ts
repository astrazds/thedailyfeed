import type { FeedItem } from './types';
import type { FeedApiResponse, FeedStreamChunk, FeedStreamStatus } from './types';

type SerializedFeedItem = FeedApiResponse['items'][number];

interface FeedStreamParseResult {
  chunks: FeedStreamChunk[];
  remaining: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isFeedStreamStatus(value: unknown): value is FeedStreamStatus {
  return value === 'cached' || value === 'success' || value === 'timeout' || value === 'error';
}

function isValidDateString(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function parseSerializedFeedItem(value: unknown): SerializedFeedItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const { title, link, pubDate, description, contentHtml, source } = value;
  if (
    typeof title !== 'string' ||
    typeof link !== 'string' ||
    typeof pubDate !== 'string' ||
    !isValidDateString(pubDate) ||
    typeof source !== 'string'
  ) {
    return null;
  }

  if (description !== undefined && typeof description !== 'string') {
    return null;
  }

  if (contentHtml !== undefined && typeof contentHtml !== 'string') {
    return null;
  }

  return {
    title,
    link,
    pubDate,
    ...(description !== undefined ? { description } : {}),
    ...(contentHtml !== undefined ? { contentHtml } : {}),
    source,
  };
}

export function parseSerializedFeedItems(value: unknown): FeedApiResponse['items'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const parsed = parseSerializedFeedItem(item);
    return parsed ? [parsed] : [];
  });
}

export function deserializeFeedItems(items: unknown): FeedItem[] {
  return parseSerializedFeedItems(items).map((item) => ({
    ...item,
    pubDate: new Date(item.pubDate),
  }));
}

export function serializeFeedItems(items: FeedItem[]): FeedApiResponse['items'] {
  return items.map((item) => ({
    ...item,
    pubDate: item.pubDate.toISOString(),
  }));
}

export function mergeAndSortFeedItems(previous: FeedItem[], nextItems: FeedItem[]): FeedItem[] {
  const map = new Map<string, FeedItem>();
  for (const item of previous) {
    map.set(`${item.link}|${item.pubDate.toISOString()}|${item.source}`, item);
  }
  for (const item of nextItems) {
    map.set(`${item.link}|${item.pubDate.toISOString()}|${item.source}`, item);
  }

  return Array.from(map.values()).sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}

export function parseFeedApiResponse(value: unknown): FeedApiResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.cached !== 'boolean') {
    return null;
  }

  if (value.timeZone !== undefined && typeof value.timeZone !== 'string') {
    return null;
  }

  return {
    items: parseSerializedFeedItems(value.items),
    cached: value.cached,
    ...(value.timeZone !== undefined ? { timeZone: value.timeZone } : {}),
  };
}

export function parseFeedStreamChunk(value: unknown): FeedStreamChunk | null {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.requestId !== 'string') {
    return null;
  }

  if (value.type === 'error') {
    if (typeof value.error !== 'string') {
      return null;
    }

    return {
      type: 'error',
      requestId: value.requestId,
      error: value.error,
    };
  }

  if (
    typeof value.cached !== 'boolean' ||
    typeof value.timeZone !== 'string' ||
    !isFiniteNonNegativeNumber(value.totalFeeds) ||
    !isFiniteNonNegativeNumber(value.completedFeeds)
  ) {
    return null;
  }

  if (value.type === 'meta') {
    return {
      type: 'meta',
      requestId: value.requestId,
      cached: value.cached,
      timeZone: value.timeZone,
      totalFeeds: value.totalFeeds,
      completedFeeds: value.completedFeeds,
    };
  }

  if (value.type === 'feed_result') {
    if (
      typeof value.feedUrl !== 'string' ||
      !isFeedStreamStatus(value.status) ||
      !isFiniteNonNegativeNumber(value.itemCount)
    ) {
      return null;
    }

    return {
      type: 'feed_result',
      requestId: value.requestId,
      cached: value.cached,
      timeZone: value.timeZone,
      totalFeeds: value.totalFeeds,
      completedFeeds: value.completedFeeds,
      feedUrl: value.feedUrl,
      status: value.status,
      itemCount: value.itemCount,
      items: parseSerializedFeedItems(value.items),
    };
  }

  if (value.type === 'done') {
    if (!isFiniteNonNegativeNumber(value.totalItemCount)) {
      return null;
    }

    return {
      type: 'done',
      requestId: value.requestId,
      cached: value.cached,
      timeZone: value.timeZone,
      totalFeeds: value.totalFeeds,
      completedFeeds: value.completedFeeds,
      totalItemCount: value.totalItemCount,
    };
  }

  return null;
}

export function parseFeedStreamLine(line: string): FeedStreamChunk {
  const parsed: unknown = JSON.parse(line);
  const chunk = parseFeedStreamChunk(parsed);
  if (!chunk) {
    throw new Error('Invalid feed stream chunk');
  }

  return chunk;
}

export function parseFeedStreamText(previousBuffer: string, text: string): FeedStreamParseResult {
  const lines = `${previousBuffer}${text}`.split('\n');
  const remaining = lines.pop() || '';
  const chunks = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseFeedStreamLine);

  return { chunks, remaining };
}
