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
import type { FeedSetLifecycleReadModel } from '@/lib/feed-set-lifecycle';

const FeedManagerModal = dynamic(
  () => import('./feed-manager-modal').then((mod) => mod.FeedManagerModal),
  { ssr: false }
);

interface FeedContentContainerProps {
  children: ReactNode;
  items: FeedItem[];
  isCached: boolean;
  loading: boolean;
  completedFeeds: number;
  totalFeeds: number;
  readerStatus: string;
}

function FeedContentContainer({
  children,
  items,
  isCached,
  loading,
  completedFeeds,
  totalFeeds,
  readerStatus,
}: FeedContentContainerProps) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div role="status" className="sr-only">
        {readerStatus}
      </div>
      <div className="max-w-[720px] mx-auto px-6 py-12">
        <FeedHeader
          itemCount={items.length}
          isCached={isCached}
          loading={loading}
          completedFeeds={completedFeeds}
          totalFeeds={totalFeeds}
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
    <div
      className="mb-8 p-4 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      style={{ backgroundColor: 'var(--code-bg)' }}
    >
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

export function getReaderStatus(input: {
  loading: boolean;
  error: string | null;
  refreshNotice: FeedSetLifecycleReadModel['refreshNotice'];
  itemCount: number;
  completedFeeds: number;
  totalFeeds: number;
}): string {
  if (input.loading) {
    if (input.totalFeeds > 0) {
      return `Loading feeds. ${Math.min(input.completedFeeds, input.totalFeeds)} of ${input.totalFeeds} feeds complete. ${input.itemCount} ${input.itemCount === 1 ? 'item' : 'items'} loaded.`;
    }
    return 'Loading feeds…';
  }

  if (input.error && input.error !== 'no-feeds') {
    return 'Unable to load feeds.';
  }

  if (input.refreshNotice === 'snapshot-fallback') {
    return `Unable to refresh. Showing saved items from today. ${input.itemCount} ${input.itemCount === 1 ? 'item' : 'items'} loaded.`;
  }

  return `${input.itemCount} ${input.itemCount === 1 ? 'item' : 'items'} loaded.`;
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

  let content: ReactNode;
  if (loading && items.length === 0) {
    content = <FeedSkeleton />;
  } else if (error && error !== 'no-feeds') {
    content = (
      <section className="text-center py-12" aria-labelledby="reader-error-title">
        <h2 id="reader-error-title" className="text-xl font-semibold mb-2">
          Unable to load feeds
        </h2>
        <p className="mb-6" style={{ color: 'var(--foreground-muted)' }}>
          {error}
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
  } else if (items.length === 0) {
    content = (
      <ReaderEmptyState
        configuredFeedCount={configuredFeedCount}
        enabledFeedCount={enabledFeedCount}
        onManageFeeds={openFeedManager}
      />
    );
  } else {
    content = <FeedList items={items} loading={loading} />;
  }

  const readerStatus = getReaderStatus({
    loading,
    error,
    refreshNotice,
    itemCount: items.length,
    completedFeeds,
    totalFeeds,
  });

  return (
    <>
      <FeedContentContainer
        items={items}
        isCached={isCached && refreshNotice === null}
        loading={loading}
        completedFeeds={completedFeeds}
        totalFeeds={totalFeeds}
        readerStatus={readerStatus}
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
        isRefreshing={loading}
        onRefreshFeeds={refreshFeeds}
        onFeedsChange={setFeeds}
        onClose={closeFeedManager}
      />
    </>
  );
}
