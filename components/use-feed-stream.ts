'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  parseFeedApiResponse,
  parseFeedStreamLine,
  parseFeedStreamText,
} from '@/lib/feed-stream-parser';
import {
  applyFeedSetApiResponse,
  applyFeedSetStreamChunk,
  beginFeedSetLifecycle,
  failFeedSetLifecycle,
  finishFeedSetLifecycle,
  type FeedSetLifecycleEffect,
  type FeedSetLifecycleReadModel,
  type FeedSetLifecycleState,
  type FeedSetLifecycleStatusItem,
  type FeedSetLifecycleTransition,
} from '@/lib/feed-set-lifecycle';
import { getEnabledFeedUrls, getFeeds } from '@/lib/feed-storage';
import { logger } from '@/lib/logger';
import { loadOfflineFeedSnapshot, saveOfflineFeedSnapshot } from '@/lib/offline-feed-cache';
import { AUTO_REFRESH_INTERVAL_MS } from '@/lib/constants';
import type { FeedItem } from '@/lib/types';

interface UseFeedStreamResult {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  isCached: boolean;
  refreshNotice: FeedSetLifecycleReadModel['refreshNotice'];
  configuredFeedCount: number;
  enabledFeedCount: number;
  completedFeeds: number;
  totalFeeds: number;
  feedStatuses: FeedSetLifecycleStatusItem[];
  refreshFeeds: () => Promise<void>;
}

function getClientTimeZone(): string {
  if (typeof window === 'undefined') {
    return 'UTC';
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function executeLifecycleEffects(effects: FeedSetLifecycleEffect[]): void {
  for (const effect of effects) {
    if (effect.type === 'persist_offline_snapshot') {
      saveOfflineFeedSnapshot(effect.feedUrls, effect.timeZone, effect.items);
    }
  }
}

export function useFeedStream(): UseFeedStreamResult {
  const clientTimeZone = useMemo(() => getClientTimeZone(), []);
  const initialTransition = useMemo(
    () => beginFeedSetLifecycle({
      feeds: [],
      timeZone: clientTimeZone,
      snapshot: null,
    }),
    [clientTimeZone]
  );

  const [booting, setBooting] = useState(true);
  const [feedReadModel, setFeedReadModel] = useState<FeedSetLifecycleReadModel>(
    initialTransition.readModel
  );
  const lifecycleStateRef = useRef<FeedSetLifecycleState>(
    initialTransition.state
  );
  const feedReadModelRef = useRef(feedReadModel);
  const abortRef = useRef<AbortController | null>(null);

  const fetchFeeds = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let currentState = lifecycleStateRef.current;
    let currentReadModel = feedReadModelRef.current;
    let fallbackFeedUrls = getEnabledFeedUrls();

    const publishTransition = (transition: FeedSetLifecycleTransition) => {
      currentState = transition.state;
      currentReadModel = transition.readModel;
      lifecycleStateRef.current = transition.state;
      feedReadModelRef.current = transition.readModel;
      setFeedReadModel(transition.readModel);
      setBooting(false);
      executeLifecycleEffects(transition.effects);
    };

    try {
      const configuredFeeds = getFeeds();
      const enabledFeeds = configuredFeeds.filter((feed) => feed.enabled);
      const feedUrls = enabledFeeds.map((feed) => feed.url);
      fallbackFeedUrls = feedUrls;
      const snapshot = loadOfflineFeedSnapshot(feedUrls, clientTimeZone);
      publishTransition(
        beginFeedSetLifecycle({
          feeds: enabledFeeds.map((feed) => ({
            url: feed.url,
            name: feed.name,
          })),
          configuredFeedCount: configuredFeeds.length,
          timeZone: clientTimeZone,
          snapshot,
        })
      );

      if (feedUrls.length === 0) {
        return;
      }

      const response = await fetch('/api/feeds?stream=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson, application/json',
        },
        body: JSON.stringify({ feedUrls, timeZone: clientTimeZone }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch feeds');
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() || '';
      const isNdjson = contentType.includes('application/x-ndjson') && response.body;

      if (!isNdjson) {
        const rawData: unknown = await response.json();
        const data = parseFeedApiResponse(rawData);
        if (!data) {
          throw new Error('Invalid feed response');
        }
        if (controller.signal.aborted) {
          return;
        }
        publishTransition(applyFeedSetApiResponse(currentState, data));
        return;
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        if (controller.signal.aborted) {
          return;
        }

        const parsed = parseFeedStreamText(buffer, value);
        buffer = parsed.remaining;
        for (const chunk of parsed.chunks) {
          publishTransition(applyFeedSetStreamChunk(currentState, chunk));
        }
      }

      if (buffer.trim()) {
        publishTransition(applyFeedSetStreamChunk(currentState, parseFeedStreamLine(buffer.trim())));
      }

      if (currentReadModel.loading) {
        publishTransition(finishFeedSetLifecycle(currentState));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      const snapshot = loadOfflineFeedSnapshot(fallbackFeedUrls, clientTimeZone);
      if (snapshot) {
        const resolvedError = err instanceof Error ? err : new Error('Unknown feed fetch error');
        publishTransition(
          failFeedSetLifecycle(currentState, {
            error: resolvedError,
            fallbackSnapshot: snapshot,
          })
        );
        logger.warn('Using offline feed snapshot after fetch failure');
      } else {
        const resolvedError = err instanceof Error ? err : new Error('Unknown feed fetch error');
        logger.error('Failed to fetch feeds from client', resolvedError);
        publishTransition(
          failFeedSetLifecycle(currentState, {
            error: resolvedError,
            fallbackSnapshot: null,
          })
        );
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [clientTimeZone]);

  useEffect(() => {
    fetchFeeds();

    const handleStorageChange = () => {
      fetchFeeds();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('feedsUpdated', handleStorageChange);

    const refreshInterval = setInterval(fetchFeeds, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('feedsUpdated', handleStorageChange);
      clearInterval(refreshInterval);
      abortRef.current?.abort();
    };
  }, [fetchFeeds]);

  return {
    items: feedReadModel.items,
    loading: booting || feedReadModel.loading,
    error: feedReadModel.error,
    isCached: feedReadModel.isCached,
    refreshNotice: feedReadModel.refreshNotice,
    configuredFeedCount: feedReadModel.configuredFeedCount,
    enabledFeedCount: feedReadModel.enabledFeedCount,
    completedFeeds: feedReadModel.completedFeeds,
    totalFeeds: feedReadModel.totalFeeds,
    feedStatuses: feedReadModel.feedStatuses,
    refreshFeeds: fetchFeeds,
  };
}
