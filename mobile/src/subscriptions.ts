import { feedsForReader, peekFeedInventory, runFeedManagerOperation, type Feed } from "../../lib/feed-storage";
import { STORAGE_KEY_FEEDS } from "../../lib/constants";
import type { SubscriptionCommand } from "./useSubscriptions";

export function readSubscriptions(): Feed[] {
  return [...feedsForReader(peekFeedInventory())];
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
