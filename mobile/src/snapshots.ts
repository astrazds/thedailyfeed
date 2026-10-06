import type { FeedSetLifecycleSnapshot } from "../../lib/feed-set-lifecycle";
import type { SerializedFeedItem } from "../../lib/types";
import type { ReaderConfig } from "./contracts";

export async function loadSnapshot(
  _config: ReaderConfig,
): Promise<FeedSetLifecycleSnapshot | null> {
  return null;
}

export async function saveSnapshot(
  _config: ReaderConfig,
  _items: SerializedFeedItem[],
): Promise<boolean> {
  return false;
}
