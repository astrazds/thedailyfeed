'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { FeedList } from './feed-list';
import { FeedHeader } from './feed-header';
import { FeedSkeleton } from './feed-skeleton';
import { FeedManagerButton } from './feed-manager-button';
import { useFeedStream } from './use-feed-stream';
import { getFeeds, type Feed } from '@/lib/feed-storage';
import type { FeedItem } from '@/lib/types';
import { getFeedLoadActivity, feedActivityAnnouncement, type FeedLoadActivity } from '@/lib/feed-load-activity';

const FeedManagerModal = dynamic(
  () => import('./feed-manager-modal').then((mod) => mod.FeedManagerModal),
  { ssr: false }
);

interface FeedContentContainerProps {
  children: ReactNode;
  items: FeedItem[];
  isCached: boolean;
  loading: boolean;
  activity: FeedLoadActivity;
  announce: boolean;
  onRefresh: () => Promise<void>;
}

function FeedContentContainer({
  children,
  items,
  isCached,
  loading,
  activity,
  announce,
  onRefresh,
}: FeedContentContainerProps) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div role="status" aria-label="Feed activity" aria-live={announce ? 'polite' : 'off'} className="sr-only">
        {announce ? feedActivityAnnouncement(activity) : ''}
      </div>
      <div className="max-w-[720px] mx-auto px-6 py-12">
        <FeedHeader
          itemCount={items.length}
          isCached={isCached}
          activity={activity}
          onRefresh={onRefresh}
        />
        <main aria-busy={loading}>{children}</main>
      </div>
    </div>
  );
}

interface ReaderEmptyStateProps {
  configuredFeedCount: number;
  enabledFeedCount: number;
  onManageFeeds: (trigger: HTMLButtonElement) => void;
}

export function ReaderEmptyState({
  configuredFeedCount,
  enabledFeedCount,
  onManageFeeds,
}: ReaderEmptyStateProps) {
  const state = configuredFeedCount === 0
    ? {
        title: 'No feeds yet',
        description: 'Add an RSS or Atom feed to start building today’s reading list.',
      }
    : enabledFeedCount === 0
      ? {
          title: 'No feeds enabled',
          description: 'Enable at least one feed to load today’s items.',
        }
      : {
          title: 'No new items today',
          description: 'Your enabled feeds have no items dated today. Manage feeds to review your sources.',
        };

  return (
    <section className="text-center py-12" aria-labelledby="reader-empty-title">
      <h2 id="reader-empty-title" className="text-xl font-semibold mb-2">
        {state.title}
      </h2>
      <p className="mb-6 text-pretty" style={{ color: 'var(--foreground-muted)' }}>
        {state.description}
      </p>
      <button
        type="button"
        onClick={(event) => onManageFeeds(event.currentTarget)}
        className="primary-action px-6 py-2 rounded font-medium button-hover-fade"
      >
        Manage feeds
      </button>
    </section>
  );
}

interface RefreshNoticeProps {
  onRefresh: () => Promise<void>;
}

export function RefreshNotice({ onRefresh }: RefreshNoticeProps) {
  return (
    <div className="reader-refresh-notice">
      <p>Unable to refresh. Showing saved items from today.</p>
      <button
        type="button"
        onClick={onRefresh}
        className="neutral-action px-4 py-2 rounded font-medium shrink-0 button-hover-fade"
      >
        Try again
      </button>
    </div>
  );
}

export function FeedContent() {
  const {
    items,
    loading,
    error,
    isCached,
    refreshNotice,
    configuredFeedCount,
    enabledFeedCount,
    completedFeeds,
    totalFeeds,
    feedStatuses,
    refreshFeeds,
  } = useFeedStream();
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const managerTriggerRef = useRef<HTMLButtonElement | null>(null);

  const openFeedManager = useCallback((trigger: HTMLButtonElement) => {
    managerTriggerRef.current = trigger;
    setFeeds(getFeeds());
    setIsManagerOpen(true);
  }, []);

  const closeFeedManager = useCallback(() => {
    setIsManagerOpen(false);
    requestAnimationFrame(() => managerTriggerRef.current?.focus());
  }, []);

  const activity = getFeedLoadActivity({
    loading,
    error,
    refreshNotice,
    items,
    configuredFeedCount,
    enabledFeedCount,
    feedStatuses,
    completedFeeds,
    totalFeeds,
  });

  let content: ReactNode;
  if (loading && items.length === 0) {
    content = <FeedSkeleton />;
  } else if (activity.type === 'failed' ||
    (items.length === 0 && (activity.type === 'partial' || activity.type === 'interrupted'))) {
    content = (
      <section className="text-center py-12" aria-labelledby="reader-error-title">
        <h2 id="reader-error-title" className="text-xl font-semibold mb-2">
          {activity.type === 'failed' ? activity.title : 'No articles loaded'}
        </h2>
        <p className="mb-6" style={{ color: 'var(--foreground-muted)' }}>
          {activity.type === 'failed' ? error : 'Try again to load articles from your sources.'}
        </p>
        <button
          type="button"
          onClick={refreshFeeds}
          className="primary-action px-6 py-2 rounded font-medium button-hover-fade"
        >
          Try again
        </button>
      </section>
    );
  } else if (items.length === 0 && activity.type === 'fallback') {
    content = null;
  } else if (items.length === 0) {
    content = (
      <ReaderEmptyState
        configuredFeedCount={configuredFeedCount}
        enabledFeedCount={enabledFeedCount}
        onManageFeeds={openFeedManager}
      />
    );
  } else {
    content = <FeedList items={items} />;
  }


  return (
    <>
      <FeedContentContainer
        items={items}
        isCached={isCached && refreshNotice === null}
        loading={loading}
        activity={activity}
        announce={!isManagerOpen}
        onRefresh={refreshFeeds}
      >
        {refreshNotice === 'snapshot-fallback' && (
          <RefreshNotice onRefresh={refreshFeeds} />
        )}
        {content}
      </FeedContentContainer>
      <FeedManagerButton isOpen={isManagerOpen} onOpen={openFeedManager} />
      <FeedManagerModal
        feeds={feeds}
        feedStatuses={feedStatuses}
        isOpen={isManagerOpen}
        activity={activity}
        onRefreshFeeds={refreshFeeds}
        onFeedsChange={setFeeds}
        onClose={closeFeedManager}
      />
    </>
  );
}
