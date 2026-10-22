import type { FeedSetPhase } from './feed-set-lifecycle';

type ActivityCopy = { title: string; detail: string };

export type FeedLoadActivity = ActivityCopy & (
  | { type: 'empty' | 'ready' | 'partial' | 'interrupted' | 'fallback' | 'failed' }
  | { type: 'loading'; completed: number; total: number }
);

function feeds(count: number): string {
  return `${count} ${count === 1 ? 'feed' : 'feeds'}`;
}

export function activityOf(phase: FeedSetPhase, configuredFeedCount: number): FeedLoadActivity {
  if (phase.kind === 'loading') {
    const completed = Math.min(phase.completedFeeds, phase.totalFeeds);
    return {
      type: 'loading',
      title: phase.items.length > 0 ? 'Refreshing feeds' : 'Loading feeds',
      detail: phase.totalFeeds > 0
        ? `${completed} of ${feeds(phase.totalFeeds)} checked`
        : 'Getting your sources ready',
      completed,
      total: phase.totalFeeds,
    };
  }
  if (phase.kind === 'snapshot-fallback') {
    return {
      type: 'fallback',
      title: 'Unable to refresh',
      detail: phase.items.length > 0 ? 'Showing saved items from today.' : 'Try again to check your feeds.',
    };
  }
  if (phase.kind === 'failed') {
    return { type: 'failed', title: 'Unable to load feeds', detail: 'Try again to check your sources.' };
  }
  if (phase.kind === 'no-feeds') {
    return { type: 'empty', title: configuredFeedCount === 0 ? 'No feeds yet' : 'No feeds enabled', detail: '' };
  }
  const pending = phase.feedStatuses.filter((feed) => feed.status === 'pending').length;
  const failed = phase.feedStatuses.filter((feed) => feed.status === 'error' || feed.status === 'timeout').length;
  if (pending > 0) {
    return {
      type: 'interrupted',
      title: 'Feed loading interrupted',
      detail: `${feeds(pending)} ${pending === 1 ? 'was' : 'were'} not checked. Try again to finish loading.`,
    };
  }
  if (failed > 0) {
    return {
      type: 'partial',
      title: 'Some feeds could not load',
      detail: `${feeds(failed)} did not load. Try again to check these sources.`,
    };
  }
  return {
    type: 'ready',
    title: 'All feeds checked',
    detail: `${phase.items.length} ${phase.items.length === 1 ? 'item' : 'items'} for today.`,
  };
}

export function feedActivityAnnouncement(activity: FeedLoadActivity): string {
  return `${activity.title}. ${activity.detail}`.trim();
}
