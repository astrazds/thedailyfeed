/**
 * Feed storage utilities for managing RSS feed URLs
 * Uses localStorage for client-side persistence
 */

import { validateAndNormalizeFeedUrl } from './url-validator';
import { MAX_FEEDS_PER_REQUEST, STORAGE_KEY_FEEDS } from './constants';
import { logger } from './logger';

export interface Feed {
  id: string;
  url: string;
  name: string;
  enabled: boolean;
  addedAt: Date;
}

export interface FeedImportEntry {
  name: string;
  url: string;
}

export interface FeedImportSummary {
  added: number;
  skippedDuplicate: number;
  invalid: number;
  overLimit: number;
}

export type ValidateFeedUrl = (url: string) => Promise<void>;

export type FeedManagerOperation =
  | {
      type: 'add';
      name: string;
      url: string;
      validateFeedUrl: ValidateFeedUrl;
    }
  | {
      type: 'edit';
      id: string;
      name: string;
      url: string;
      validateFeedUrl: ValidateFeedUrl;
    }
  | {
      type: 'toggle';
      id: string;
    }
  | {
      type: 'delete';
      id: string;
    }
  | {
      type: 'import-opml';
      feeds: FeedImportEntry[];
      maxFeeds?: number;
    };

export type FeedManagerOperationResult = { feeds: Feed[] } & (
  | { type: 'add' | 'edit' | 'toggle' | 'delete' }
  | { type: 'import-opml'; summary: FeedImportSummary }
);

const STORAGE_KEY = STORAGE_KEY_FEEDS;

// Default feeds
export const DEFAULT_FEEDS: Feed[] = [
  {
    id: 'default-daring-fireball',
    url: 'https://daringfireball.net/feeds/main',
    name: 'Daring Fireball',
    enabled: true,
    addedAt: new Date('2026-02-06'),
  },
  {
    id: 'default-the-verge',
    url: 'https://www.theverge.com/rss/index.xml',
    name: 'The Verge',
    enabled: true,
    addedAt: new Date('2026-02-06'),
  },
  {
    id: 'default-wired',
    url: 'https://www.wired.com/feed/rss',
    name: 'WIRED',
    enabled: true,
    addedAt: new Date('2026-02-06'),
  },
];

function cloneFeed(feed: Feed): Feed {
  return {
    ...feed,
    addedAt: new Date(feed.addedAt),
  };
}

function getDefaultFeeds(): Feed[] {
  return DEFAULT_FEEDS.map(cloneFeed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseFeed(value: unknown): Feed | null {
  if (!isRecord(value)) {
    return null;
  }

  const { id, url, name, enabled, addedAt } = value;
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    typeof url !== 'string' ||
    typeof name !== 'string' ||
    !name.trim() ||
    typeof enabled !== 'boolean'
  ) {
    return null;
  }

  const parsedAddedAt = parseDate(addedAt);
  if (!parsedAddedAt) {
    return null;
  }

  try {
    return {
      id,
      url: validateAndNormalizeFeedUrl(url),
      name: name.trim(),
      enabled,
      addedAt: parsedAddedAt,
    };
  } catch {
    return null;
  }
}

function parseFeeds(value: unknown): Feed[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const seenUrls = new Set<string>();
  const feeds: Feed[] = [];
  for (const candidate of value) {
    const feed = parseFeed(candidate);
    if (!feed || seenUrls.has(feed.url)) {
      continue;
    }

    seenUrls.add(feed.url);
    feeds.push(feed);
  }

  return feeds;
}

/**
 * Get all feeds from storage
 */
export function getFeeds(): Feed[] {
  if (typeof window === 'undefined') return getDefaultFeeds();
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return getDefaultFeeds();
    
    const parsed: unknown = JSON.parse(stored);
    const feeds = parseFeeds(parsed);
    if (!feeds) {
      return getDefaultFeeds();
    }

    if (Array.isArray(parsed) && feeds.length !== parsed.length) {
      try {
        saveFeeds(feeds);
      } catch {
        // Cleanup is best effort; retain the valid records we already read.
      }
    }

    return feeds;
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown localStorage read error');
    logger.error('Failed to load feeds from localStorage', err);
    return getDefaultFeeds();
  }
}

/**
 * Get only enabled feed URLs
 */
export function getEnabledFeedUrls(): string[] {
  return getFeeds()
    .filter((feed) => feed.enabled)
    .map((feed) => feed.url);
}

export class FeedStorageError extends Error {
  constructor() {
    super('Unable to save feeds in browser storage. Allow site storage or free up browser space, then try again.');
    this.name = 'FeedStorageError';
  }
}

export class FeedLimitError extends Error {
  constructor() {
    super(`You can save up to ${MAX_FEEDS_PER_REQUEST} feeds. Delete a feed before adding another.`);
    this.name = 'FeedLimitError';
  }
}

function assertFeedCapacity(feeds: Feed[]): void {
  if (feeds.length >= MAX_FEEDS_PER_REQUEST) throw new FeedLimitError();
}

/**
 * Save feeds to storage
 */
function saveFeeds(feeds: Feed[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    const validFeeds = parseFeeds(feeds) ?? [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validFeeds));
  } catch (error) {
    // Do not expose storage exception text, which can contain sensitive values.
    void error;
    throw new FeedStorageError();
  }
}

// Counter for fallback ID generation
let idCounter = 0;

/**
 * Generate unique ID for feed using crypto API
 */
function generateFeedId(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback: timestamp + random + counter for uniqueness
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 11);
  const counter = (++idCounter).toString(36);
  
  return `${timestamp}-${random}-${counter}`;
}

function normalizeFeedMutationInput(url: string, name: string): Pick<Feed, 'url' | 'name'> {
  const validatedUrl = validateAndNormalizeFeedUrl(url);
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Feed name cannot be empty');
  }

  return {
    url: validatedUrl,
    name: trimmedName,
  };
}

function createFeed(url: string, name: string): Feed {
  return {
    id: generateFeedId(),
    url,
    name,
    enabled: true,
    addedAt: new Date(),
  };
}

function addFeedTo(feeds: Feed[], url: string, name: string): Feed[] {
  const normalized = normalizeFeedMutationInput(url, name);
  const existingFeed = feeds.find((feed) => feed.url === normalized.url);
  if (existingFeed) {
    throw new Error(`Feed already exists: ${existingFeed.name}`);
  }

  assertFeedCapacity(feeds);
  const feed = createFeed(normalized.url, normalized.name);
  return [...feeds, feed];
}

function importFeedsInto(
  feeds: Feed[],
  importedFeeds: FeedImportEntry[],
  maxFeeds: number
): { feeds: Feed[]; summary: FeedImportSummary } {
  const nextFeeds = [...feeds];
  const summary: FeedImportSummary = {
    added: 0,
    skippedDuplicate: 0,
    invalid: 0,
    overLimit: 0,
  };

  for (const feed of importedFeeds) {
    let normalized: Pick<Feed, 'url' | 'name'>;
    try {
      normalized = normalizeFeedMutationInput(feed.url, feed.name);
    } catch {
      summary.invalid += 1;
      continue;
    }

    if (nextFeeds.some((storedFeed) => storedFeed.url === normalized.url)) {
      summary.skippedDuplicate += 1;
      continue;
    }

    if (nextFeeds.length >= maxFeeds) {
      summary.overLimit += 1;
      continue;
    }

    nextFeeds.push(createFeed(normalized.url, normalized.name));
    summary.added += 1;
  }

  return { feeds: nextFeeds, summary };
}

function updateFeedIn(feeds: Feed[], id: string, updates: Pick<Feed, 'url' | 'name'>): Feed[] {
  const normalizedUpdates = normalizeFeedMutationInput(updates.url, updates.name);
  const existingFeed = feeds.find(feed => feed.id !== id && feed.url === normalizedUpdates.url);
  if (existingFeed) throw new Error(`Feed already exists: ${existingFeed.name}`);

  let found = false;
  const updatedFeeds = feeds.map((feed) => {
    if (feed.id !== id) {
      return feed;
    }

    found = true;
    return { ...feed, ...normalizedUpdates };
  });

  if (!found) {
    throw new Error('Feed not found');
  }

  return updatedFeeds;
}

function notifyFeedsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('feedsUpdated'));
  }
}

function enabledFeedUrls(feeds: Feed[]): Set<string> {
  return new Set(feeds.filter((feed) => feed.enabled).map((feed) => feed.url));
}

function didEnabledFeedSetChange(previousFeeds: Feed[], nextFeeds: Feed[]): boolean {
  const previousUrls = enabledFeedUrls(previousFeeds);
  const nextUrls = enabledFeedUrls(nextFeeds);
  return previousUrls.size !== nextUrls.size || [...previousUrls].some((url) => !nextUrls.has(url));
}

export async function runFeedManagerOperation(
  operation: FeedManagerOperation
): Promise<FeedManagerOperationResult> {
  if (operation.type === 'add') assertFeedCapacity(getFeeds());
  if (operation.type === 'add' || operation.type === 'edit') {
    await operation.validateFeedUrl(operation.url.trim());
  }

  const previousFeeds = getFeeds();
  let result: FeedManagerOperationResult;

  switch (operation.type) {
    case 'add':
      result = { type: operation.type, feeds: addFeedTo(previousFeeds, operation.url.trim(), operation.name.trim()) };
      break;
    case 'edit':
      result = { type: operation.type, feeds: updateFeedIn(previousFeeds, operation.id, {
        name: operation.name.trim(), url: operation.url.trim(),
      }) };
      break;
    case 'toggle':
      result = { type: operation.type, feeds: previousFeeds.map(feed =>
        feed.id === operation.id ? { ...feed, enabled: !feed.enabled } : feed
      ) };
      break;
    case 'delete':
      result = { type: operation.type, feeds: previousFeeds.filter(feed => feed.id !== operation.id) };
      break;
    case 'import-opml':
      result = { type: operation.type, ...importFeedsInto(previousFeeds, operation.feeds, operation.maxFeeds ?? MAX_FEEDS_PER_REQUEST) };
      break;
  }

  if (result.type !== 'import-opml' || result.summary.added > 0) saveFeeds(result.feeds);
  if (didEnabledFeedSetChange(previousFeeds, result.feeds)) notifyFeedsUpdated();
  return result;
}
