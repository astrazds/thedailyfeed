import { useState, useSyncExternalStore } from "react";
import {
  feedsForReader,
  peekFeedInventory,
  runFeedManagerOperation,
  type Feed,
  type FeedManagerOperation,
} from "../../lib/feed-storage";
import { applySubscription, subscribeToSubscriptions } from "./subscriptions";

type WithoutValidator<T> = T extends unknown
  ? Omit<T, "validateFeedUrl">
  : never;
export type SubscriptionCommand = WithoutValidator<FeedManagerOperation>;

const EMPTY_FEEDS: Feed[] = [];

export function useSubscriptions() {
  const [store] = useState(() => {
    let snapshot: Feed[] | null = null;
    let notify: (() => void) | undefined;
    const publish = () => {
      snapshot = [...feedsForReader(peekFeedInventory())];
      notify?.();
    };
    return {
      getSnapshot: () => snapshot,
      subscribe(onChange: () => void) {
        notify = onChange;
        let cancelled = false;
        const unsubscribe = subscribeToSubscriptions(() => {
          if (!cancelled) publish();
        });
        void runFeedManagerOperation({ type: "hydrate" }).finally(() => {
          if (!cancelled) publish();
        });
        return () => {
          cancelled = true;
          unsubscribe();
          notify = undefined;
        };
      },
      async apply(command: SubscriptionCommand) {
        const result = await applySubscription(command);
        publish();
        return result;
      },
    };
  });
  const feeds = useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
  return { feeds: feeds ?? EMPTY_FEEDS, ready: feeds !== null, apply: store.apply };
}
