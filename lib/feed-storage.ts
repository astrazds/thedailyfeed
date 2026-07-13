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

export type FeedManagerOperationType = FeedManagerOperation['type'];

export interface FeedManagerMutationFacts {
  type: FeedManagerOperationType;
  changedFeeds: Feed[];
  enabledFeedSetChanged: boolean;
  importSummary?: FeedImportSummary;
}

export interface FeedManagerOperationResult {
  feeds: Feed[];
  mutation: FeedManagerMutationFacts;
}

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
      saveFeeds(feeds);
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

/**
 * Save feeds to storage
 */
export function saveFeeds(feeds: Feed[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    const validFeeds = parseFeeds(feeds) ?? [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validFeeds));
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown localStorage write error');
    logger.error('Failed to save feeds to localStorage', err);
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

function addFeedTo(feeds: Feed[], url: string, name: string): { feeds: Feed[]; feed: Feed } {
  const normalized = normalizeFeedMutationInput(url, name);
  const existingFeed = feeds.find((feed) => feed.url === normalized.url);
  if (existingFeed) {
    throw new Error(`Feed already exists: ${existingFeed.name}`);
  }

  const feed = createFeed(normalized.url, normalized.name);
  return { feeds: [...feeds, feed], feed };
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

function updateFeedIn(feeds: Feed[], id: string, updates: Partial<Feed>): Feed[] {
  const normalizedUpdates: Partial<Feed> = { ...updates };
  if (typeof normalizedUpdates.url === 'string') {
    normalizedUpdates.url = validateAndNormalizeFeedUrl(normalizedUpdates.url);
  }
  if (typeof normalizedUpdates.name === 'string') {
    const trimmedName = normalizedUpdates.name.trim();
    if (!trimmedName) {
      throw new Error('Feed name cannot be empty');
    }
    normalizedUpdates.name = trimmedName;
  }

  if (normalizedUpdates.url) {
    const existingFeed = feeds.find(
      (feed) => feed.id !== id && feed.url === normalizedUpdates.url
    );
    if (existingFeed) {
      throw new Error(`Feed already exists: ${existingFeed.name}`);
    }
  }

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

function didFeedChange(previousFeed: Feed, nextFeed: Feed): boolean {
  return previousFeed.name !== nextFeed.name
    || previousFeed.url !== nextFeed.url
    || previousFeed.enabled !== nextFeed.enabled
    || previousFeed.addedAt.getTime() !== nextFeed.addedAt.getTime();
}

function changedFeeds(previousFeeds: Feed[], nextFeeds: Feed[]): Feed[] {
  const previousById = new Map(previousFeeds.map((feed) => [feed.id, feed]));
  const nextIds = new Set(nextFeeds.map((feed) => feed.id));
  return [
    ...nextFeeds.filter((feed) => {
      const previousFeed = previousById.get(feed.id);
      return previousFeed === undefined || didFeedChange(previousFeed, feed);
    }),
    ...previousFeeds.filter((feed) => !nextIds.has(feed.id)),
  ];
}

function finishManagerOperation(
  type: FeedManagerOperationType,
  previousFeeds: Feed[],
  feeds: Feed[],
  importSummary?: FeedImportSummary
): FeedManagerOperationResult {
  const enabledFeedSetChanged = didEnabledFeedSetChange(previousFeeds, feeds);
  if (enabledFeedSetChanged) {
    notifyFeedsUpdated();
  }

  const mutation: FeedManagerMutationFacts = {
    type,
    changedFeeds: changedFeeds(previousFeeds, feeds),
    enabledFeedSetChanged,
  };
  if (importSummary !== undefined) {
    mutation.importSummary = importSummary;
  }

  return { feeds, mutation };
}

/**
 * Add a new feed
 */
export function addFeed(url: string, name: string): Feed {
  const feeds = getFeeds();
  const result = addFeedTo(feeds, url, name);
  saveFeeds(result.feeds);
  return result.feed;
}

/**
 * Import feeds through the same storage mutation semantics as manual feed additions.
 */
export function importFeeds(
  importedFeeds: FeedImportEntry[],
  maxFeeds: number = MAX_FEEDS_PER_REQUEST
): FeedImportSummary {
  const result = importFeedsInto(getFeeds(), importedFeeds, maxFeeds);
  if (result.summary.added > 0) {
    saveFeeds(result.feeds);
  }
  return result.summary;
}

/**
 * Update an existing feed
 */
export function updateFeed(id: string, updates: Partial<Feed>): void {
  const feeds = getFeeds();
  saveFeeds(updateFeedIn(feeds, id, updates));
}

/**
 * Delete a feed
 */
export function deleteFeed(id: string): void {
  const feeds = getFeeds();
  const filteredFeeds = feeds.filter((feed) => feed.id !== id);
  saveFeeds(filteredFeeds);
}

/**
 * Toggle feed enabled status
 */
export function toggleFeed(id: string): void {
  const feeds = getFeeds();
  const updatedFeeds = feeds.map((feed) =>
    feed.id === id ? { ...feed, enabled: !feed.enabled } : feed
  );
  saveFeeds(updatedFeeds);
}

/**
 * Apply one user-visible Feed manager mutation through a single storage transaction.
 */
export async function runFeedManagerOperation(
  operation: FeedManagerOperation
): Promise<FeedManagerOperationResult> {
  if (operation.type === 'add' || operation.type === 'edit') {
    await operation.validateFeedUrl(operation.url.trim());
  }

  const previousFeeds = getFeeds();
  let feeds: Feed[];
  let importSummary: FeedImportSummary | undefined;

  switch (operation.type) {
    case 'add':
      feeds = addFeedTo(previousFeeds, operation.url.trim(), operation.name.trim()).feeds;
      saveFeeds(feeds);
      break;
    case 'edit':
      feeds = updateFeedIn(previousFeeds, operation.id, {
        name: operation.name.trim(),
        url: operation.url.trim(),
      });
      saveFeeds(feeds);
      break;
    case 'toggle':
      feeds = previousFeeds.map((feed) =>
        feed.id === operation.id ? { ...feed, enabled: !feed.enabled } : feed
      );
      saveFeeds(feeds);
      break;
    case 'delete':
      feeds = previousFeeds.filter((feed) => feed.id !== operation.id);
      saveFeeds(feeds);
      break;
    case 'import-opml': {
      const result = importFeedsInto(
        previousFeeds,
        operation.feeds,
        operation.maxFeeds ?? MAX_FEEDS_PER_REQUEST
      );
      feeds = result.feeds;
      importSummary = result.summary;
      if (result.summary.added > 0) {
        saveFeeds(feeds);
      }
      break;
    }
  }

  return finishManagerOperation(operation.type, previousFeeds, feeds, importSummary);
}
