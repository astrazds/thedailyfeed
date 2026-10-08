import { useState, useSyncExternalStore } from "react";
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

const EMPTY_FEEDS: Feed[] = [];

export function useSubscriptions() {
  const [store] = useState(() => {
    let snapshot: Feed[] | null = null;
    let notify: (() => void) | undefined;
    const update = () => {
      snapshot = readSubscriptions();
      notify?.();
    };
    return {
      getSnapshot: () => snapshot,
      subscribe(onChange: () => void) {
        notify = onChange;
        const unsubscribe = subscribeToSubscriptions(update);
        update();
        return () => {
          unsubscribe();
          notify = undefined;
        };
      },
      async apply(command: SubscriptionCommand) {
        const result = await applySubscription(command);
        update();
        return result;
      },
    };
  });
  const feeds = useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
  return { feeds: feeds ?? EMPTY_FEEDS, ready: feeds !== null, apply: store.apply };
}
