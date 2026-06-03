import type { FeedApiResponse } from './types';
import { getDayKeyForTimeZone, normalizeTimeZone } from './date-utils';
import { parseSerializedFeedItems } from './feed-stream-parser';
import { logger } from './logger';

export const OFFLINE_FEED_SNAPSHOT_STORAGE_KEY = 'rss-offline-feed-snapshots-v1';
export const MAX_OFFLINE_SNAPSHOTS = 20;
export const MAX_OFFLINE_SNAPSHOT_BYTES = 256_000;
export const MAX_OFFLINE_CACHE_BYTES = 1_500_000;

export interface StoredSnapshot {
  cacheKey: string;
  timeZone: string;
  dayKey: string;
  savedAt: string;
  items: FeedApiResponse['items'];
}

function getSnapshotCacheKey(feedUrls: string[], timeZone: string): string {
  return `${[...feedUrls].sort().join('|')}::${normalizeTimeZone(timeZone)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDateString(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function getJsonByteLength(value: unknown): number {
  const json = JSON.stringify(value);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(json).byteLength;
  }

  return json.length;
}

function parseStoredSnapshot(value: unknown): StoredSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const { cacheKey, timeZone, dayKey, savedAt } = value;
  if (
    typeof cacheKey !== 'string' ||
    typeof timeZone !== 'string' ||
    typeof dayKey !== 'string' ||
    typeof savedAt !== 'string' ||
    !isValidDateString(savedAt)
  ) {
    return null;
  }

  return {
    cacheKey,
    timeZone: normalizeTimeZone(timeZone),
    dayKey,
    savedAt,
    items: parseSerializedFeedItems(value.items),
  };
}

function trimSnapshotToByteLimit(snapshot: StoredSnapshot): StoredSnapshot {
  if (getJsonByteLength(snapshot) <= MAX_OFFLINE_SNAPSHOT_BYTES) {
    return snapshot;
  }

  let low = 0;
  let high = snapshot.items.length;
  let bestItems: FeedApiResponse['items'] = [];

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidateItems = snapshot.items.slice(0, midpoint);
    const candidate = { ...snapshot, items: candidateItems };

    if (getJsonByteLength(candidate) <= MAX_OFFLINE_SNAPSHOT_BYTES) {
      bestItems = candidateItems;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  return {
    ...snapshot,
    items: bestItems,
  };
}

function pruneSnapshotsToLimits(snapshots: StoredSnapshot[]): StoredSnapshot[] {
  const next = snapshots
    .map(trimSnapshotToByteLimit)
    .slice(0, MAX_OFFLINE_SNAPSHOTS);

  while (next.length > 1 && getJsonByteLength(next) > MAX_OFFLINE_CACHE_BYTES) {
    next.pop();
  }

  if (next.length === 1 && getJsonByteLength(next) > MAX_OFFLINE_CACHE_BYTES) {
    return [trimSnapshotToByteLimit(next[0])];
  }

  return next;
}

function isQuotaExceededError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  );
}

function tryWriteSnapshots(snapshots: StoredSnapshot[]): boolean {
  try {
    localStorage.setItem(OFFLINE_FEED_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
    return true;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      const err = error instanceof Error ? error : new Error('Unknown offline snapshot write error');
      logger.error('Failed to write offline feed snapshots', err);
      return true;
    }

    return false;
  }
}

function readAllSnapshots(): StoredSnapshot[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(OFFLINE_FEED_SNAPSHOT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const snapshots = pruneSnapshotsToLimits(
      parsed.flatMap((entry) => {
        const snapshot = parseStoredSnapshot(entry);
        return snapshot ? [snapshot] : [];
      })
    );

    if (snapshots.length !== parsed.length || getJsonByteLength(snapshots) < getJsonByteLength(parsed)) {
      writeAllSnapshots(snapshots);
    }

    return snapshots;
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown offline snapshot read error');
    logger.error('Failed to read offline feed snapshots', err);
    return [];
  }
}

function writeAllSnapshots(snapshots: StoredSnapshot[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  const cappedSnapshots = pruneSnapshotsToLimits(snapshots);
  if (tryWriteSnapshots(cappedSnapshots)) {
    return;
  }

  for (let count = cappedSnapshots.length - 1; count >= 0; count -= 1) {
    const reduced = cappedSnapshots.slice(0, count);
    if (tryWriteSnapshots(reduced)) {
      logger.warn('Pruned offline feed snapshots after localStorage quota failure');
      return;
    }
  }

  logger.warn('Unable to persist offline feed snapshots due to localStorage quota');
}

export function saveOfflineFeedSnapshot(
  feedUrls: string[],
  timeZone: string,
  items: FeedApiResponse['items']
): void {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const cacheKey = getSnapshotCacheKey(feedUrls, normalizedTimeZone);
  const nextSnapshot = trimSnapshotToByteLimit({
    cacheKey,
    timeZone: normalizedTimeZone,
    dayKey: getDayKeyForTimeZone(new Date(), normalizedTimeZone),
    savedAt: new Date().toISOString(),
    items: parseSerializedFeedItems(items),
  });

  const existing = readAllSnapshots().filter((entry) => entry.cacheKey !== cacheKey);
  const next = [nextSnapshot, ...existing];
  writeAllSnapshots(next);
}

export function loadOfflineFeedSnapshot(
  feedUrls: string[],
  timeZone: string
): StoredSnapshot | null {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const cacheKey = getSnapshotCacheKey(feedUrls, normalizedTimeZone);
  const snapshots = readAllSnapshots();
  return snapshots.find((entry) => entry.cacheKey === cacheKey) ?? null;
}
