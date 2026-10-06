import {
  loadOfflineFeedSnapshot,
  saveOfflineFeedSnapshot,
  OFFLINE_FEED_SNAPSHOT_STORAGE_KEY,
} from "../../lib/offline-feed-cache";
import type { SerializedFeedItem } from "../../lib/types";
import type { ReaderConfig } from "./contracts";

export async function loadSnapshot(config: ReaderConfig) {
  localStorage.getItem(OFFLINE_FEED_SNAPSHOT_STORAGE_KEY);
  return loadOfflineFeedSnapshot(
    config.feeds.map((feed) => feed.url),
    config.timeZone,
  );
}

export async function saveSnapshot(
  config: ReaderConfig,
  items: SerializedFeedItem[],
): Promise<boolean> {
  return saveOfflineFeedSnapshot(
    config.feeds.map((feed) => feed.url),
    config.timeZone,
    items,
  );
}
