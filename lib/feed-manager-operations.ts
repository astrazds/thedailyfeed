import type { Feed } from './feed-storage';
import { addFeed, deleteFeed, getFeeds, importFeeds, toggleFeed, updateFeed } from './feed-storage';
import {
  type OPMLFeedEntry,
  type OPMLImportSummary,
} from './opml';

export interface FeedManagerOperationResult {
  feeds: Feed[];
  mutation: FeedManagerMutationFacts;
}

export type ValidateFeedUrl = (url: string) => Promise<void>;

export type FeedManagerOperation =
  | {
      type: 'add';
      name: string;
      url: string;
      validateFeedUrl: ValidateFeedUrl;
    }
  | {
      type: 'edit';
      id: string;
      name: string;
      url: string;
      validateFeedUrl: ValidateFeedUrl;
    }
  | {
      type: 'toggle';
      id: string;
    }
  | {
      type: 'delete';
      id: string;
    }
  | {
      type: 'import-opml';
      feeds: OPMLFeedEntry[];
      maxFeeds?: number;
    };

export type FeedManagerOperationType = FeedManagerOperation['type'];

export interface FeedManagerMutationFacts {
  type: FeedManagerOperationType;
  changedFeeds: Feed[];
  enabledFeedSetChanged: boolean;
  importSummary?: OPMLImportSummary;
}

function notifyFeedsUpdated(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event('feedsUpdated'));
}

function enabledFeedUrls(feeds: Feed[]): Set<string> {
  return new Set(feeds.filter((feed) => feed.enabled).map((feed) => feed.url));
}

function didEnabledFeedSetChange(previousFeeds: Feed[], nextFeeds: Feed[]): boolean {
  const previousUrls = enabledFeedUrls(previousFeeds);
  const nextUrls = enabledFeedUrls(nextFeeds);

  if (previousUrls.size !== nextUrls.size) {
    return true;
  }

  for (const url of previousUrls) {
    if (!nextUrls.has(url)) {
      return true;
    }
  }

  return false;
}

function didFeedChange(previousFeed: Feed, nextFeed: Feed): boolean {
  return (
    previousFeed.name !== nextFeed.name ||
    previousFeed.url !== nextFeed.url ||
    previousFeed.enabled !== nextFeed.enabled ||
    previousFeed.addedAt.getTime() !== nextFeed.addedAt.getTime()
  );
}

function changedFeeds(previousFeeds: Feed[], nextFeeds: Feed[]): Feed[] {
  const previousById = new Map(previousFeeds.map((feed) => [feed.id, feed]));
  const nextById = new Map(nextFeeds.map((feed) => [feed.id, feed]));
  const changed = nextFeeds.filter((feed) => {
    const previousFeed = previousById.get(feed.id);
    return previousFeed === undefined || didFeedChange(previousFeed, feed);
  });
  const deleted = previousFeeds.filter((feed) => !nextById.has(feed.id));

  return [...changed, ...deleted];
}

function buildOperationResult(
  type: FeedManagerOperationType,
  previousFeeds: Feed[],
  feeds: Feed[],
  importSummary?: OPMLImportSummary
): FeedManagerOperationResult {
  const enabledFeedSetChanged = didEnabledFeedSetChange(previousFeeds, feeds);
  if (enabledFeedSetChanged) {
    notifyFeedsUpdated();
  }

  const mutation: FeedManagerMutationFacts = {
    type,
    changedFeeds: changedFeeds(previousFeeds, feeds),
    enabledFeedSetChanged,
  };

  if (importSummary !== undefined) {
    mutation.importSummary = importSummary;
  }

  return {
    feeds,
    mutation,
  };
}

export async function runFeedManagerOperation(
  operation: FeedManagerOperation
): Promise<FeedManagerOperationResult> {
  switch (operation.type) {
    case 'add': {
      const url = operation.url.trim();
      const name = operation.name.trim();

      await operation.validateFeedUrl(url);
      const previousFeeds = getFeeds();
      addFeed(url, name);
      const feeds = getFeeds();

      return buildOperationResult(operation.type, previousFeeds, feeds);
    }

    case 'edit': {
      const url = operation.url.trim();
      const name = operation.name.trim();

      await operation.validateFeedUrl(url);
      const previousFeeds = getFeeds();
      updateFeed(operation.id, { name, url });
      const feeds = getFeeds();

      return buildOperationResult(operation.type, previousFeeds, feeds);
    }

    case 'toggle': {
      const previousFeeds = getFeeds();
      toggleFeed(operation.id);
      const feeds = getFeeds();

      return buildOperationResult(operation.type, previousFeeds, feeds);
    }

    case 'delete': {
      const previousFeeds = getFeeds();
      deleteFeed(operation.id);
      const feeds = getFeeds();

      return buildOperationResult(operation.type, previousFeeds, feeds);
    }

    case 'import-opml': {
      const previousFeeds = getFeeds();
      const summary = importFeeds(operation.feeds, operation.maxFeeds);
      const feeds = getFeeds();

      return buildOperationResult(operation.type, previousFeeds, feeds, summary);
    }
  }
}
