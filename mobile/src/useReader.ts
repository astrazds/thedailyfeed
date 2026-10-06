import { useCallback, useEffect, useRef, useState } from "react";
import { fetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  beginFeedSetLifecycle,
  applyFeedSetStreamChunk,
  applyFeedSetApiResponse,
  failFeedSetLifecycle,
  finishFeedSetLifecycle,
} from "../../lib/feed-set-lifecycle";
import type { FeedSetLifecycleTransition } from "../../lib/feed-set-lifecycle";
import type { ReaderConfig } from "./contracts";
import { consumeFeedResponse } from "./transport";
import {
  SNAPSHOT_KEY,
  configIdentity,
  decodeSnapshot,
  encodeSnapshot,
} from "./snapshot";
export function useReader(config: ReaderConfig) {
  const [model, setModel] = useState(
    () =>
      beginFeedSetLifecycle({
        feeds: config.feeds,
        timeZone: config.timeZone,
        snapshot: null,
      }).readModel,
  );
  const [storageNotice, setStorageNotice] = useState(false);
  const generation = useRef(0);
  const displayedIdentity = useRef(configIdentity(config));
  const controller = useRef<AbortController | null>(null);
  const writes = useRef(Promise.resolve());
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const current = () =>
      generation.current === request && !abort.signal.aborted;
    let snapshot = null;
    let transition = beginFeedSetLifecycle({
      feeds: config.feeds,
      timeZone: config.timeZone,
      snapshot: null,
    });
    const identity = configIdentity(config);
    const sameConfig = displayedIdentity.current === identity;
    displayedIdentity.current = identity;
    setModel((previous) => ({
      ...(sameConfig ? previous : transition.readModel),
      loading: true,
      error: null,
      refreshNotice: null,
      completedFeeds: 0,
      totalFeeds: config.feeds.length,
    }));
    setStorageNotice(false);
    try {
      snapshot = decodeSnapshot(
        await AsyncStorage.getItem(SNAPSHOT_KEY),
        config,
      );
    } catch {
      if (current()) setStorageNotice(true);
    }
    if (!current()) return;
    transition = beginFeedSetLifecycle({
      feeds: config.feeds,
      timeZone: config.timeZone,
      snapshot,
    });
    const publish = (next: FeedSetLifecycleTransition) => {
      if (!current()) return;
      transition = next;
      setModel(next.readModel);
      for (const effect of next.effects) {
        const encoded = encodeSnapshot(config, effect.items);
        writes.current = writes.current
          .catch(() => undefined)
          .then(async () => {
            if (!current()) return;
            if (!encoded) {
              setStorageNotice(true);
              return;
            }
            try {
              await AsyncStorage.setItem(SNAPSHOT_KEY, encoded);
            } catch {
              if (current()) setStorageNotice(true);
            }
          });
      }
    };
    publish(transition);
    if (!config.feeds.length) return;
    try {
      const response = await fetch(
        `${config.apiOrigin.replace(/\/$/, "")}/api/feeds?stream=1`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson, application/json",
          },
          body: JSON.stringify({
            feedUrls: config.feeds.map((feed) => feed.url),
            timeZone: config.timeZone,
          }),
          signal: abort.signal,
        },
      );
      if (!current()) return;
      const json = await consumeFeedResponse(
        response,
        (chunk) => {
          if (current())
            publish(applyFeedSetStreamChunk(transition.state, chunk));
        },
        abort.signal,
      );
      if (!current()) return;
      if (json) publish(applyFeedSetApiResponse(transition.state, json));
      else if (transition.readModel.loading)
        publish(finishFeedSetLifecycle(transition.state));
      await writes.current;
    } catch (error) {
      if (!current()) return;
      publish(
        failFeedSetLifecycle(transition.state, {
          error:
            error instanceof Error ? error : new Error("Unable to fetch feeds"),
          fallbackSnapshot: snapshot,
        }),
      );
    }
  }, [config]);
  useEffect(() => {
    void refresh();
    return () => {
      ++generation.current;
      controller.current?.abort();
    };
  }, [refresh]);
  return { model, refresh, storageNotice };
}
