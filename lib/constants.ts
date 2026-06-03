/**
 * Application-wide constants
 * Centralized configuration for easy maintenance
 */

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// Content Display
export const CONTENT_MAX_LENGTH = 600;
export const CONTENT_TRUNCATE_LENGTH = 500;

// Rate Limiting
export const RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv('RATE_LIMIT_MAX_REQUESTS', 10);
export const RATE_LIMIT_WINDOW_MS = parsePositiveIntEnv('RATE_LIMIT_WINDOW_MS', 60000);

// Caching
export const FEED_CACHE_TTL_MS = parsePositiveIntEnv('FEED_CACHE_TTL_MS', 3600000); // 1 hour
export const FEED_CACHE_MAX_ENTRIES = parsePositiveIntEnv('FEED_CACHE_MAX_ENTRIES', 200);
export const CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Feed Fetching
export const FEED_TIMEOUT_MS = parsePositiveIntEnv('FEED_TIMEOUT_MS', 10000); // 10 seconds
export const FEED_RETRY_COUNT = parseNonNegativeIntEnv('FEED_RETRY_COUNT', 3);
export const FEED_RETRY_DELAY_MS = 1000;
export const FEED_OVERALL_TIMEOUT_MS = parsePositiveIntEnv('FEED_OVERALL_TIMEOUT_MS', 30000); // 30 seconds
export const MAX_FEEDS_PER_REQUEST = 50;

// Auto-refresh
export const AUTO_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// LocalStorage Keys
export const STORAGE_KEY_FEEDS = 'rss-feeds';

// HTTP Headers
export const USER_AGENT = 'The Daily Feed RSS Reader/1.0 (+https://thedailyfeed.app)';
export const ACCEPT_HEADER = 'application/rss+xml, application/xml, text/xml, */*';
