import { useCallback, useEffect, useState } from "react";
import type { Feed, FeedManagerOperation } from "../../lib/feed-storage";
import {
  applySubscription,
  readSubscriptions,
  subscribeToSubscriptions,
} from "./subscriptions";

type WithoutValidator<T> = T extends unknown
  ? Omit<T, "validateFeedUrl">
  : never;
export type SubscriptionCommand = WithoutValidator<FeedManagerOperation>;

export function useSubscriptions() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const update = () => setFeeds(readSubscriptions());
    const unsubscribe = subscribeToSubscriptions(update);
    update();
    setReady(true);
    return unsubscribe;
  }, []);
  const apply = useCallback(async (command: SubscriptionCommand) => {
    const result = await applySubscription(command);
    setFeeds(readSubscriptions());
    return result;
  }, []);
  return { feeds, ready, apply };
}
