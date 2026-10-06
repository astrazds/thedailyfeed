import {
  getFeeds,
  runFeedManagerOperation,
  type Feed,
} from "../../lib/feed-storage";
import { MAX_FEEDS_PER_REQUEST, STORAGE_KEY_FEEDS } from "../../lib/constants";
import { validateAndNormalizeFeedUrl } from "../../lib/url-validator";
import type { SubscriptionCommand } from "./useSubscriptions";

const MVP_CONFIG_KEY = "daily-feed-expo.config.v1";

export function readSubscriptions(): Feed[] {
  try {
    if (localStorage.getItem(STORAGE_KEY_FEEDS) === null) {
      const raw = localStorage.getItem(MVP_CONFIG_KEY);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (
          typeof value === "object" &&
          value !== null &&
          "feeds" in value &&
          Array.isArray(value.feeds) &&
          value.feeds.length <= MAX_FEEDS_PER_REQUEST
        ) {
          const urls = new Set<string>();
          const feeds: Feed[] = value.feeds.map((entry: unknown) => {
            if (
              typeof entry !== "object" ||
              entry === null ||
              !("name" in entry) ||
              typeof entry.name !== "string" ||
              !entry.name.trim() ||
              !("url" in entry) ||
              typeof entry.url !== "string"
            )
              throw new Error("Invalid saved feed");
            const url = validateAndNormalizeFeedUrl(entry.url);
            if (urls.has(url)) throw new Error("Duplicate saved feed");
            urls.add(url);
            return {
              id: crypto.randomUUID(),
              url,
              name: entry.name.trim(),
              enabled: true,
              addedAt: new Date(),
            };
          });
          localStorage.setItem(STORAGE_KEY_FEEDS, JSON.stringify(feeds));
        }
      }
    }
  } catch {
    return getFeeds();
  }
  return getFeeds();
}

export async function applySubscription(command: SubscriptionCommand) {
  return runFeedManagerOperation(
    command.type === "add" || command.type === "edit"
      ? {
          ...command,
          validateFeedUrl: async (url) => {
            const response = await fetch("/api/feeds/validate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url }),
            });
            if (!response.ok) throw new Error("Feed validation failed");
          },
        }
      : command,
  );
}

export function subscribeToSubscriptions(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY_FEEDS || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("feedsUpdated", onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("feedsUpdated", onChange);
  };
}
