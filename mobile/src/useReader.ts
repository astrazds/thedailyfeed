import { useCallback, useEffect, useRef, useState } from "react";
import { fetch } from "expo/fetch";
import {
  applyFeedSetApiResponse,
  applyFeedSetStreamChunk,
  beginFeedSetLifecycle,
  continueFeedSetLifecycle,
  failFeedSetLifecycle,
  finishFeedSetLifecycle,
  type FeedSetLifecycleTransition,
  type FeedSetPhase,
} from "../../lib/feed-set-lifecycle";
import type { ReaderConfig } from "./contracts";
import { consumeFeedResponse } from "./transport";
import { loadSnapshot, saveSnapshot } from "./snapshots";
import { editionInstant, readerFrame, type EditionInstant, type ReaderFrame } from "./reader-frame";

const STORAGE_NOTICE = "Reading is available. Saving for offline use is unavailable.";

function withStorageNotice(frame: ReaderFrame, notice: string | null): ReaderFrame {
  if (!notice) return frame;
  return { ...frame, header: { ...frame.header, storageNotice: notice } };
}

export function useReader(config: ReaderConfig, ready: boolean): {
  frame: ReaderFrame;
  refresh: () => Promise<void>;
  editionStartedAt: EditionInstant;
} {
  const identity = JSON.stringify([
    config.timeZone,
    [...new Set(config.feeds.map((feed) => feed.url))].sort(),
  ]);
  const latestConfig = useRef(config);
  useEffect(() => {
    latestConfig.current = config;
  });
  const [phase, setPhase] = useState(() =>
    beginFeedSetLifecycle({
      feeds: config.feeds,
      timeZone: config.timeZone,
      configuredFeedCount: config.configuredFeedCount,
      snapshot: null,
    }).phase,
  );
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [editionStartedAt, setEditionStartedAt] = useState(() => editionInstant(new Date()));
  const generation = useRef(0);
  const displayedIdentity = useRef(identity);
  const controller = useRef<AbortController | null>(null);
  const writes = useRef(Promise.resolve());
  const refresh = useCallback(async () => {
    if (!ready) return;
    const startedAt = new Date();
    const currentConfig = latestConfig.current;
    const request = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const current = () => generation.current === request && !abort.signal.aborted;
    let snapshot = null;
    const sameConfig = displayedIdentity.current === identity;
    displayedIdentity.current = identity;
    setPhase((previous) =>
      sameConfig
        ? continueFeedSetLifecycle(previous).phase
        : beginFeedSetLifecycle({
            feeds: currentConfig.feeds,
            timeZone: currentConfig.timeZone,
            configuredFeedCount: currentConfig.configuredFeedCount,
            snapshot: null,
          }).phase,
    );
    setStorageNotice(null);
    try {
      snapshot = await loadSnapshot(currentConfig);
    } catch {
      if (current()) setStorageNotice(STORAGE_NOTICE);
    }
    if (!current()) return;
    const instant = editionInstant(startedAt);
    setEditionStartedAt(instant);
    let active = beginFeedSetLifecycle({
      feeds: currentConfig.feeds,
      timeZone: currentConfig.timeZone,
      configuredFeedCount: currentConfig.configuredFeedCount,
      snapshot,
    });
    const publish = (next: FeedSetLifecycleTransition) => {
      if (!current()) return;
      active = next;
      setPhase(next.phase);
      for (const effect of next.effects) {
        writes.current = writes.current
          .catch(() => undefined)
          .then(async () => {
            if (!current()) return;
            try {
              const saved = await saveSnapshot(currentConfig, effect.items);
              if (current() && !saved) setStorageNotice(STORAGE_NOTICE);
            } catch {
              if (current()) setStorageNotice(STORAGE_NOTICE);
            }
          });
      }
    };
    publish(active);
    if (!currentConfig.feeds.length) return;
    try {
      const response = await fetch("/api/feeds?stream=1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson, application/json",
        },
        body: JSON.stringify({
          feedUrls: currentConfig.feeds.map((feed) => feed.url),
          timeZone: currentConfig.timeZone,
        }),
        signal: abort.signal,
      });
      if (!current()) return;
      const json = await consumeFeedResponse(
        response,
        (chunk) => {
          if (current()) publish(applyFeedSetStreamChunk(active.phase, chunk));
        },
        abort.signal,
      );
      if (!current()) return;
      if (json) publish(applyFeedSetApiResponse(active.phase, json));
      else if (active.phase.kind === "loading") publish(finishFeedSetLifecycle(active.phase));
      await writes.current;
    } catch (error) {
      if (!current()) return;
      publish(
        failFeedSetLifecycle(active.phase, {
          error: error instanceof Error ? error : new Error("Unable to fetch feeds"),
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
  const shown =
    ready && !(phase.kind === "no-feeds" && config.feeds.length > 0)
      ? phase
      : loadingPhase(config, phase);
  return {
    frame: withStorageNotice(
      readerFrame({
        phase: shown,
        editionStartedAt,
        configuredFeedCount: config.configuredFeedCount,
        timeZone: config.timeZone,
      }),
      storageNotice,
    ),
    refresh,
    editionStartedAt,
  };
}

function loadingPhase(config: ReaderConfig, phase: FeedSetPhase): FeedSetPhase {
  if (phase.kind === "loading" && config.feeds.length === 0) return phase;
  const begun = beginFeedSetLifecycle({
    feeds: config.feeds,
    timeZone: config.timeZone,
    configuredFeedCount: config.configuredFeedCount,
    snapshot: null,
  });
  return begun.phase.kind === "loading" ? begun.phase : continueFeedSetLifecycle(begun.phase).phase;
}
