'use client';

import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { FeedList } from './feed-list';
import { FeedHeader } from './feed-header';
import { FeedSkeleton } from './feed-skeleton';
import { FeedManagerButton } from './feed-manager-button';
import { useFeedStream } from './use-feed-stream';
import type { FeedItem } from '@/lib/rss';

interface FeedContentContainerProps {
  children: ReactNode;
  today: string;
  items: FeedItem[];
  isCached: boolean;
  loading: boolean;
  completedFeeds: number;
  totalFeeds: number;
  feedStatuses: ReturnType<typeof useFeedStream>['feedStatuses'];
}

function FeedContentContainer({
  children,
  today,
  items,
  isCached,
  loading,
  completedFeeds,
  totalFeeds,
  feedStatuses,
}: FeedContentContainerProps) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <FeedManagerButton feedStatuses={feedStatuses} />
      <div className="max-w-[720px] mx-auto px-6 py-12">
        <FeedHeader
          today={today}
          itemCount={items.length}
          isCached={isCached}
          loading={loading}
          completedFeeds={completedFeeds}
          totalFeeds={totalFeeds}
        />
        <main>{children}</main>
      </div>
    </div>
  );
}

export function FeedContent() {
  const {
    items,
    loading,
    error,
    isCached,
    completedFeeds,
    totalFeeds,
    feedStatuses,
    refreshFeeds,
  } = useFeedStream();
  const today = format(new Date(), 'EEEE, MMMM d, yyyy');

  if (loading && items.length === 0) {
    return (
      <FeedContentContainer
        today={today}
        items={items}
        isCached={isCached}
        loading={loading}
        completedFeeds={completedFeeds}
        totalFeeds={totalFeeds}
        feedStatuses={feedStatuses}
      >
        <FeedSkeleton />
      </FeedContentContainer>
    );
  }

  if (error) {
    const isNoFeeds = error === 'no-feeds';

    return (
      <FeedContentContainer
        today={today}
        items={items}
        isCached={isCached}
        loading={loading}
        completedFeeds={completedFeeds}
        totalFeeds={totalFeeds}
        feedStatuses={feedStatuses}
      >
        <div className="text-center py-12">
          <p className="text-lg mb-4" style={{ color: 'var(--foreground-muted)' }}>
            {isNoFeeds ? 'Add feeds to see daily content' : error}
          </p>
          {!isNoFeeds && (
            <button
              onClick={refreshFeeds}
              className="px-6 py-2 rounded font-medium transition-colors button-hover-fade"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background)',
              }}
            >
              Try Again
            </button>
          )}
        </div>
      </FeedContentContainer>
    );
  }

  return (
    <FeedContentContainer
      today={today}
      items={items}
      isCached={isCached}
      loading={loading}
      completedFeeds={completedFeeds}
      totalFeeds={totalFeeds}
      feedStatuses={feedStatuses}
    >
      <FeedList items={items} loading={loading} />
    </FeedContentContainer>
  );
}
