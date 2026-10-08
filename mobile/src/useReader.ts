import { useCallback, useEffect, useRef, useState } from "react";
import { fetch } from "expo/fetch";
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
import { loadSnapshot, saveSnapshot } from "./snapshots";

export function useReader(config: ReaderConfig, ready = true) {
  const identity = JSON.stringify([
    config.timeZone,
    [...new Set(config.feeds.map((feed) => feed.url))].sort(),
  ]);
  const latestConfig = useRef(config);
  useEffect(() => {
    latestConfig.current = config;
  });
  const [model, setModel] = useState(
    () =>
      beginFeedSetLifecycle({
        feeds: config.feeds,
        timeZone: config.timeZone,
        configuredFeedCount: config.configuredFeedCount,
        snapshot: null,
      }).readModel,
  );
  const [storageNotice, setStorageNotice] = useState(false);
  const generation = useRef(0);
  const displayedIdentity = useRef(identity);
  const controller = useRef<AbortController | null>(null);
  const writes = useRef(Promise.resolve());
  const refresh = useCallback(async () => {
    if (!ready) return;
    const config = latestConfig.current;
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
      configuredFeedCount: config.configuredFeedCount,
      snapshot: null,
    });
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
      snapshot = await loadSnapshot(config);
    } catch {
      if (current()) setStorageNotice(true);
    }
    if (!current()) return;
    transition = beginFeedSetLifecycle({
      feeds: config.feeds,
      timeZone: config.timeZone,
      configuredFeedCount: config.configuredFeedCount,
      snapshot,
    });
    const publish = (next: FeedSetLifecycleTransition) => {
      if (!current()) return;
      transition = next;
      setModel(next.readModel);
      for (const effect of next.effects) {
        writes.current = writes.current
          .catch(() => undefined)
          .then(async () => {
            if (!current()) return;
            try {
              const saved = await saveSnapshot(config, effect.items);
              if (current() && !saved) setStorageNotice(true);
            } catch {
              if (current()) setStorageNotice(true);
            }
          });
      }
    };
    publish(transition);
    if (!config.feeds.length) return;
    try {
      const response = await fetch("/api/feeds?stream=1", {
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
      });
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
  }, [identity, ready]);
  const cancel = useCallback(() => {
    ++generation.current;
    controller.current?.abort();
  }, []);
  useEffect(() => {
    void refresh();
    return cancel;
  }, [refresh, cancel]);
  const names = new Map(config.feeds.map((feed) => [feed.url, feed.name]));
  return {
    model: {
      ...model,
      configuredFeedCount: config.configuredFeedCount,
      feedStatuses: model.feedStatuses.map((status) => ({
        ...status,
        feedName: names.get(status.feedUrl) ?? status.feedName,
      })),
    },
    refresh,
    storageNotice,
  };
}
