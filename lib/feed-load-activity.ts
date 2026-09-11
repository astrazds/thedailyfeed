import type { FeedSetLifecycleReadModel } from './feed-set-lifecycle';

type ActivityCopy = { title: string; detail: string };

export type FeedLoadActivity = ActivityCopy & (
  | { type: 'empty' | 'ready' | 'partial' | 'interrupted' | 'fallback' | 'failed' }
  | { type: 'loading'; completed: number; total: number }
);

type ActivityInput = Pick<FeedSetLifecycleReadModel,
  'loading' | 'items' | 'error' | 'refreshNotice' | 'enabledFeedCount' |
  'configuredFeedCount' | 'completedFeeds' | 'totalFeeds' | 'feedStatuses'>;

function feeds(count: number): string {
  return `${count} ${count === 1 ? 'feed' : 'feeds'}`;
}

export function getFeedLoadActivity(input: ActivityInput): FeedLoadActivity {
  if (input.loading) {
    const completed = Math.min(input.completedFeeds, input.totalFeeds);
    return {
      type: 'loading',
      title: input.items.length > 0 ? 'Refreshing feeds' : 'Loading feeds',
      detail: input.totalFeeds > 0
        ? `${completed} of ${feeds(input.totalFeeds)} checked`
        : 'Getting your sources ready',
      completed,
      total: input.totalFeeds,
    };
  }
  if (input.refreshNotice === 'snapshot-fallback') {
    return { type: 'fallback', title: 'Unable to refresh', detail: 'Showing saved items from today.' };
  }
  if (input.error && input.error !== 'no-feeds') {
    return { type: 'failed', title: 'Unable to load feeds', detail: 'Try again to check your sources.' };
  }
  if (input.enabledFeedCount === 0) {
    return { type: 'empty', title: input.configuredFeedCount === 0 ? 'No feeds yet' : 'No feeds enabled', detail: '' };
  }
  const pending = input.feedStatuses.filter(feed => feed.status === 'pending').length;
  const failed = input.feedStatuses.filter(feed => feed.status === 'error' || feed.status === 'timeout').length;
  if (pending > 0) {
    return {
      type: 'interrupted', title: 'Feed loading interrupted',
      detail: `${feeds(pending)} ${pending === 1 ? 'was' : 'were'} not checked. Try again to finish loading.`,
    };
  }
  if (failed > 0) {
    return {
      type: 'partial', title: 'Some feeds could not load',
      detail: `${feeds(failed)} did not load. Try again to check these sources.`,
    };
  }
  return {
    type: 'ready', title: 'All feeds checked',
    detail: `${input.items.length} ${input.items.length === 1 ? 'item' : 'items'} for today.`,
  };
}

export function feedActivityAnnouncement(activity: FeedLoadActivity): string {
  return `${activity.title}. ${activity.detail}`.trim();
}
