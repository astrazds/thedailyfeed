import {
  deserializeFeedItems,
  mergeAndSortFeedItems,
  serializeFeedItems,
} from './feed-stream-parser';
import { getDayKeyForTimeZone, normalizeTimeZone } from './date-utils';
import type { FeedItem } from './types';
import type { FeedApiResponse, FeedStreamChunk, FeedStreamStatus } from './types';

export interface FeedSetLifecycleFeed {
  url: string;
  name: string;
}

export interface FeedSetLifecycleSnapshot {
  timeZone?: string;
  dayKey?: string;
  items: FeedApiResponse['items'];
}

export interface FeedStatus {
  feedUrl: string;
  feedName: string;
  status: 'pending' | FeedStreamStatus;
  itemCount: number;
}

export type FeedSetLifecycleStatusItem = FeedStatus;

declare const phaseBrand: unique symbol;

export type FeedSetPhase = { readonly [phaseBrand]: true } & (
  | {
      kind: 'loading';
      items: readonly FeedItem[];
      preview: 'snapshot' | 'none';
      completedFeeds: number;
      totalFeeds: number;
      feedStatuses: readonly FeedStatus[];
      requestId: string | null;
    }
  | { kind: 'no-feeds' }
  | {
      kind: 'ready' | 'partial' | 'interrupted';
      items: readonly FeedItem[];
      cached: boolean;
      feedStatuses: readonly FeedStatus[];
      requestId: string | null;
    }
  | {
      kind: 'failed';
      items: readonly FeedItem[];
      message: string;
      feedStatuses: readonly FeedStatus[];
      requestId: string | null;
    }
  | {
      kind: 'snapshot-fallback';
      items: readonly FeedItem[];
      feedStatuses: readonly FeedStatus[];
      requestId: string | null;
    }
);

const phaseBrandSymbol = Symbol('FeedSetPhase');

interface Internal {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  isCached: boolean;
  refreshNotice: 'snapshot-fallback' | null;
  configuredFeedCount: number;
  enabledFeedCount: number;
  completedFeeds: number;
  totalFeeds: number;
  feedStatuses: FeedStatus[];
  feedUrls: string[];
  timeZone: string;
  requestId: string | null;
  hasAppliedNetworkResults: boolean;
}

const internals = new WeakMap<FeedSetPhase, Internal>();

export type FeedSetLifecycleEffect =
  | {
      type: 'persist_offline_snapshot';
      feedUrls: string[];
      timeZone: string;
      items: FeedApiResponse['items'];
    };

export interface FeedSetLifecycleTransition {
  phase: FeedSetPhase;
  effects: FeedSetLifecycleEffect[];
}

function branded(phase: Record<string, unknown>): FeedSetPhase {
  return { [phaseBrandSymbol]: true, ...phase } as unknown as FeedSetPhase;
}

function toPhase(state: Internal): FeedSetPhase {
  if (state.loading) {
    return branded({
      kind: 'loading',
      items: state.items,
      preview: state.isCached ? 'snapshot' : 'none',
      completedFeeds: state.completedFeeds,
      totalFeeds: state.totalFeeds,
      feedStatuses: state.feedStatuses,
      requestId: state.requestId,
    });
  }
  if (state.error === 'no-feeds') {
    return branded({ kind: 'no-feeds' });
  }
  if (state.refreshNotice === 'snapshot-fallback') {
    return branded({
      kind: 'snapshot-fallback',
      items: state.items,
      feedStatuses: state.feedStatuses,
      requestId: state.requestId,
    });
  }
  if (state.error) {
    return branded({
      kind: 'failed',
      items: state.items,
      message: state.error,
      feedStatuses: state.feedStatuses,
      requestId: state.requestId,
    });
  }
  const pending = state.feedStatuses.some((feed) => feed.status === 'pending');
  const failed = state.feedStatuses.some((feed) => feed.status === 'error' || feed.status === 'timeout');
  const kind = pending ? 'interrupted' : failed ? 'partial' : 'ready';
  return branded({
    kind,
    items: state.items,
    cached: state.isCached,
    feedStatuses: state.feedStatuses,
    requestId: state.requestId,
  });
}

function publish(state: Internal, effects: FeedSetLifecycleEffect[]): FeedSetLifecycleTransition {
  const phase = toPhase(state);
  internals.set(phase, state);
  return { phase, effects };
}

function internalOf(phase: FeedSetPhase): Internal {
  const state = internals.get(phase);
  if (!state) {
    throw new Error('Unknown feed set phase');
  }
  return state;
}

export function beginFeedSetLifecycle(input: {
  feeds: FeedSetLifecycleFeed[];
  configuredFeedCount?: number;
  timeZone: string;
  now?: Date;
  snapshot: FeedSetLifecycleSnapshot | null;
}): FeedSetLifecycleTransition {
  const feedUrls = input.feeds.map((feed) => feed.url);
  const configuredFeedCount = input.configuredFeedCount ?? input.feeds.length;
  const enabledFeedCount = input.feeds.length;
  const normalizedTimeZone = normalizeTimeZone(input.timeZone);

  if (feedUrls.length === 0) {
    return publish(
      {
        items: [],
        loading: false,
        error: 'no-feeds',
        isCached: false,
        refreshNotice: null,
        configuredFeedCount,
        enabledFeedCount,
        completedFeeds: 0,
        totalFeeds: 0,
        feedStatuses: [],
        feedUrls,
        timeZone: normalizedTimeZone,
        requestId: null,
        hasAppliedNetworkResults: false,
      },
      []
    );
  }

  const snapshot = getUsableSnapshot(input.snapshot, normalizedTimeZone, input.now ?? new Date());
  const items = snapshot ? deserializeFeedItems(snapshot.items) : [];

  return publish(
    {
      items,
      loading: true,
      error: null,
      isCached: snapshot !== null,
      refreshNotice: null,
      configuredFeedCount,
      enabledFeedCount,
      completedFeeds: 0,
      totalFeeds: feedUrls.length,
      feedStatuses: input.feeds.map((feed) => ({
        feedUrl: feed.url,
        feedName: feed.name,
        status: 'pending',
        itemCount: 0,
      })),
      feedUrls,
      timeZone: normalizedTimeZone,
      requestId: null,
      hasAppliedNetworkResults: false,
    },
    []
  );
}

export function continueFeedSetLifecycle(phase: FeedSetPhase): FeedSetLifecycleTransition {
  const current = internalOf(phase);
  return publish(
    {
      ...current,
      loading: true,
      error: null,
      refreshNotice: null,
      isCached: current.isCached || current.refreshNotice === 'snapshot-fallback',
      completedFeeds: 0,
      totalFeeds: current.feedUrls.length,
    },
    []
  );
}

function getUsableSnapshot(
  snapshot: FeedSetLifecycleSnapshot | null,
  timeZone: string,
  now: Date
): FeedSetLifecycleSnapshot | null {
  if (!snapshot) {
    return null;
  }

  if (snapshot.timeZone !== undefined && normalizeTimeZone(snapshot.timeZone) !== timeZone) {
    return null;
  }

  if (snapshot.dayKey !== undefined && snapshot.dayKey !== getDayKeyForTimeZone(now, timeZone)) {
    return null;
  }

  return snapshot;
}

function formatFeedSetFailureMessage(requestId: string | null): string {
  const message = 'Failed to load feeds. Please try again.';
  return requestId ? `${message} Request ID: ${requestId}.` : message;
}

export function applyFeedSetStreamChunk(
  phase: FeedSetPhase,
  chunk: FeedStreamChunk
): FeedSetLifecycleTransition {
  const currentState = internalOf(phase);

  if (chunk.type === 'meta') {
    return publish(
      {
        ...currentState,
        requestId: chunk.requestId,
        isCached: chunk.cached,
        refreshNotice: null,
        completedFeeds: chunk.completedFeeds,
        totalFeeds: chunk.totalFeeds,
      },
      []
    );
  }

  if (chunk.type === 'feed_result') {
    const parsedItems = deserializeFeedItems(chunk.items);
    const previousItems = currentState.hasAppliedNetworkResults ? currentState.items : [];
    const nextItems = mergeAndSortFeedItems(previousItems, parsedItems);
    const existingStatus = currentState.feedStatuses.find(
      (item) => item.feedUrl === chunk.feedUrl
    );
    const nextStatus: FeedStatus = {
      feedUrl: chunk.feedUrl,
      feedName: existingStatus?.feedName ?? chunk.feedUrl,
      status: chunk.status,
      itemCount: chunk.itemCount,
    };

    return publish(
      {
        ...currentState,
        requestId: chunk.requestId,
        items: nextItems,
        isCached: chunk.cached,
        refreshNotice: null,
        completedFeeds: chunk.completedFeeds,
        totalFeeds: chunk.totalFeeds,
        hasAppliedNetworkResults: true,
        feedStatuses: existingStatus
          ? currentState.feedStatuses.map((item) =>
              item.feedUrl === chunk.feedUrl ? nextStatus : item
            )
          : [...currentState.feedStatuses, nextStatus],
      },
      []
    );
  }

  if (chunk.type === 'done') {
    const nextState = {
      ...currentState,
      requestId: chunk.requestId,
      loading: false,
      isCached: chunk.cached,
      refreshNotice: null,
      completedFeeds: 0,
      totalFeeds: 0,
    };

    return publish(nextState, [
      {
        type: 'persist_offline_snapshot',
        feedUrls: nextState.feedUrls,
        timeZone: nextState.timeZone,
        items: serializeFeedItems(nextState.items),
      },
    ]);
  }

  throw new Error(chunk.error || 'Failed to fetch feeds');
}

export function applyFeedSetApiResponse(
  phase: FeedSetPhase,
  response: FeedApiResponse
): FeedSetLifecycleTransition {
  const currentState = internalOf(phase);
  const items = deserializeFeedItems(response.items);
  const status = response.cached ? 'cached' : 'success';
  const nextState: Internal = {
    ...currentState,
    items,
    loading: false,
    error: null,
    isCached: response.cached,
    refreshNotice: null,
    completedFeeds: 0,
    totalFeeds: 0,
    hasAppliedNetworkResults: true,
    feedStatuses: currentState.feedStatuses.map((item) => ({
      ...item,
      status,
      itemCount: items.length,
    })),
  };

  return publish(nextState, [
    {
      type: 'persist_offline_snapshot',
      feedUrls: nextState.feedUrls,
      timeZone: nextState.timeZone,
      items: serializeFeedItems(items),
    },
  ]);
}

export function failFeedSetLifecycle(
  phase: FeedSetPhase,
  input: {
    error: Error;
    now?: Date;
    fallbackSnapshot: FeedSetLifecycleSnapshot | null;
  }
): FeedSetLifecycleTransition {
  const currentState = internalOf(phase);
  const snapshot = getUsableSnapshot(
    input.fallbackSnapshot,
    currentState.timeZone,
    input.now ?? new Date()
  );

  if (snapshot) {
    return publish(
      {
        ...currentState,
        items: deserializeFeedItems(snapshot.items),
        loading: false,
        error: null,
        isCached: true,
        refreshNotice: 'snapshot-fallback',
        completedFeeds: 0,
        totalFeeds: 0,
      },
      []
    );
  }

  return publish(
    {
      ...currentState,
      loading: false,
      error: formatFeedSetFailureMessage(currentState.requestId),
      isCached: false,
      refreshNotice: null,
      completedFeeds: 0,
      totalFeeds: 0,
    },
    []
  );
}

export function finishFeedSetLifecycle(phase: FeedSetPhase): FeedSetLifecycleTransition {
  const currentState = internalOf(phase);

  return publish(
    {
      ...currentState,
      loading: false,
      refreshNotice: null,
      completedFeeds: 0,
      totalFeeds: 0,
    },
    []
  );
}
