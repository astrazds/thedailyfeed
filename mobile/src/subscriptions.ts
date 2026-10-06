import type { Feed, FeedManagerOperationResult } from "../../lib/feed-storage";
import type { SubscriptionCommand } from "./useSubscriptions";

export function readSubscriptions(): Feed[] {
  return [];
}

export async function applySubscription(
  _command: SubscriptionCommand,
): Promise<FeedManagerOperationResult> {
  throw new Error(
    "Subscription persistence is available in the web app. Native storage is not implemented yet.",
  );
}

export function subscribeToSubscriptions(_onChange: () => void): () => void {
  return () => undefined;
}
