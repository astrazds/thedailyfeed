import {
  deserializeFeedItems,
  mergeAndSortFeedItems,
  serializeFeedItems,
} from './feed-stream-parser';
import { getDayKeyForTimeZone, normalizeTimeZone } from './date-utils';
import type { FeedItem } from './rss';
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

export interface FeedSetLifecycleStatusItem {
  feedUrl: string;
  feedName: string;
  status: 'pending' | FeedStreamStatus;
  itemCount: number;
}

export interface FeedSetLifecycleReadModel {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  isCached: boolean;
  configuredFeedCount: number;
  enabledFeedCount: number;
  completedFeeds: number;
  totalFeeds: number;
  feedStatuses: FeedSetLifecycleStatusItem[];
  requestId: string | null;
}

const feedSetLifecycleStateBrand: unique symbol = Symbol('FeedSetLifecycleState');

export interface FeedSetLifecycleState {
  readonly [feedSetLifecycleStateBrand]: true;
}

interface FeedSetLifecycleImplementationState extends FeedSetLifecycleState {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  isCached: boolean;
  configuredFeedCount: number;
  enabledFeedCount: number;
  completedFeeds: number;
  totalFeeds: number;
  feedStatuses: FeedSetLifecycleStatusItem[];
  feedUrls: string[];
  timeZone: string;
  requestId: string | null;
  hasAppliedNetworkResults: boolean;
}

export type FeedSetLifecycleEffect =
  | {
      type: 'persist_offline_snapshot';
      feedUrls: string[];
      timeZone: string;
      items: FeedApiResponse['items'];
    };

export interface FeedSetLifecycleTransition {
  state: FeedSetLifecycleState;
  readModel: FeedSetLifecycleReadModel;
  effects: FeedSetLifecycleEffect[];
}

function readModelFromState(
  state: FeedSetLifecycleImplementationState
): FeedSetLifecycleReadModel {
  return {
    items: state.items,
    loading: state.loading,
    error: state.error,
    isCached: state.isCached,
    configuredFeedCount: state.configuredFeedCount,
    enabledFeedCount: state.enabledFeedCount,
    completedFeeds: state.completedFeeds,
    totalFeeds: state.totalFeeds,
    feedStatuses: state.feedStatuses,
    requestId: state.requestId,
  };
}

function transitionFromState(
  state: FeedSetLifecycleImplementationState,
  effects: FeedSetLifecycleEffect[]
): FeedSetLifecycleTransition {
  return {
    state,
    readModel: readModelFromState(state),
    effects,
  };
}

function implementationStateOf(
  state: FeedSetLifecycleState
): FeedSetLifecycleImplementationState {
  return state as FeedSetLifecycleImplementationState;
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
    return transitionFromState(
      {
        [feedSetLifecycleStateBrand]: true,
        items: [],
        loading: false,
        error: 'no-feeds',
        isCached: false,
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

  return transitionFromState(
    {
      [feedSetLifecycleStateBrand]: true,
      items,
      loading: true,
      error: null,
      isCached: snapshot !== null,
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
  state: FeedSetLifecycleState,
  chunk: FeedStreamChunk
): FeedSetLifecycleTransition {
  const currentState = implementationStateOf(state);

  if (chunk.type === 'meta') {
    return transitionFromState(
      {
        ...currentState,
        requestId: chunk.requestId,
        isCached: chunk.cached,
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
    const nextStatus: FeedSetLifecycleStatusItem = {
      feedUrl: chunk.feedUrl,
      feedName: existingStatus?.feedName ?? chunk.feedUrl,
      status: chunk.status,
      itemCount: chunk.itemCount,
    };

    return transitionFromState(
      {
        ...currentState,
        requestId: chunk.requestId,
        items: nextItems,
        isCached: chunk.cached,
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
      completedFeeds: 0,
      totalFeeds: 0,
    };

    return transitionFromState(
      nextState,
      [
        {
          type: 'persist_offline_snapshot',
          feedUrls: nextState.feedUrls,
          timeZone: nextState.timeZone,
          items: serializeFeedItems(nextState.items),
        },
      ]
    );
  }

  throw new Error(chunk.error || 'Failed to fetch feeds');
}

export function applyFeedSetApiResponse(
  state: FeedSetLifecycleState,
  response: FeedApiResponse
): FeedSetLifecycleTransition {
  const currentState = implementationStateOf(state);
  const items = deserializeFeedItems(response.items);
  const status = response.cached ? 'cached' : 'success';
  const nextState: FeedSetLifecycleImplementationState = {
    ...currentState,
    items,
    loading: false,
    error: null,
    isCached: response.cached,
    completedFeeds: 0,
    totalFeeds: 0,
    hasAppliedNetworkResults: true,
    feedStatuses: currentState.feedStatuses.map((item) => ({
      ...item,
      status,
      itemCount: items.length,
    })),
  };

  return transitionFromState(
    nextState,
    [
      {
        type: 'persist_offline_snapshot',
        feedUrls: nextState.feedUrls,
        timeZone: nextState.timeZone,
        items: serializeFeedItems(items),
      },
    ]
  );
}

export function failFeedSetLifecycle(
  state: FeedSetLifecycleState,
  input: {
    error: Error;
    now?: Date;
    fallbackSnapshot: FeedSetLifecycleSnapshot | null;
  }
): FeedSetLifecycleTransition {
  const currentState = implementationStateOf(state);
  const snapshot = getUsableSnapshot(
    input.fallbackSnapshot,
    currentState.timeZone,
    input.now ?? new Date()
  );

  if (snapshot) {
    return transitionFromState(
      {
        ...currentState,
        items: deserializeFeedItems(snapshot.items),
        loading: false,
        error: null,
        isCached: true,
        completedFeeds: 0,
        totalFeeds: 0,
      },
      []
    );
  }

  return transitionFromState(
    {
      ...currentState,
      loading: false,
      error: formatFeedSetFailureMessage(currentState.requestId),
      isCached: false,
      completedFeeds: 0,
      totalFeeds: 0,
    },
    []
  );
}

export function finishFeedSetLifecycle(
  state: FeedSetLifecycleState
): FeedSetLifecycleTransition {
  const currentState = implementationStateOf(state);

  return transitionFromState(
    {
      ...currentState,
      loading: false,
      completedFeeds: 0,
      totalFeeds: 0,
    },
    []
  );
}
