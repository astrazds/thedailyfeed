import { getDayKeyForTimeZone } from "../../lib/date-utils";
import { parseSerializedFeedItems } from "../../lib/feed-stream-parser";
import type { FeedSetLifecycleSnapshot } from "../../lib/feed-set-lifecycle";
import type { SerializedFeedItem } from "../../lib/types";
import type { ReaderConfig } from "./contracts";
export const SNAPSHOT_KEY = "daily-feed-expo.snapshot.v1";
export const CONFIG_KEY = "daily-feed-expo.config.v1";
export const SNAPSHOT_LIMIT = 256_000;
export function configIdentity(config: ReaderConfig): string {
  return JSON.stringify([
    config.apiOrigin,
    [...new Set(config.feeds.map((feed) => feed.url))].sort(),
    config.timeZone,
  ]);
}
export function encodeSnapshot(
  config: ReaderConfig,
  items: SerializedFeedItem[],
  now = new Date(),
): string | null {
  const value = JSON.stringify({
    identity: configIdentity(config),
    timeZone: config.timeZone,
    dayKey: getDayKeyForTimeZone(now, config.timeZone),
    savedAt: now.toISOString(),
    items,
  });
  return new TextEncoder().encode(value).byteLength <= SNAPSHOT_LIMIT
    ? value
    : null;
}
export function decodeSnapshot(
  raw: string | null,
  config: ReaderConfig,
  now = new Date(),
): FeedSetLifecycleSnapshot | null {
  if (!raw || new TextEncoder().encode(raw).byteLength > SNAPSHOT_LIMIT)
    return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== "object" ||
      value === null ||
      !("identity" in value) ||
      value.identity !== configIdentity(config) ||
      !("timeZone" in value) ||
      value.timeZone !== config.timeZone ||
      !("dayKey" in value) ||
      value.dayKey !== getDayKeyForTimeZone(now, config.timeZone) ||
      !("items" in value) ||
      !Array.isArray(value.items) ||
      !("savedAt" in value) ||
      typeof value.savedAt !== "string" ||
      Number.isNaN(Date.parse(value.savedAt))
    )
      return null;
    const items = parseSerializedFeedItems(value.items);
    if (items.length !== value.items.length) return null;
    return { timeZone: config.timeZone, dayKey: value.dayKey, items };
  } catch {
    return null;
  }
}
