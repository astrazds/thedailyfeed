'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { FeedActivity } from './feed-activity';
import type { FeedLoadActivity } from '@/lib/feed-load-activity';

interface FeedHeaderProps {
  itemCount: number;
  isCached?: boolean;
  activity: FeedLoadActivity;
  onRefresh: () => Promise<void>;
}

export function FeedHeader({
  itemCount,
  isCached = false,
  activity,
  onRefresh,
}: FeedHeaderProps) {
  const [today, setToday] = useState('Today');

  useEffect(() => {
    const updateId = window.setTimeout(() => {
      setToday(format(new Date(), 'EEEE, MMMM d, yyyy'));
    }, 0);

    return () => window.clearTimeout(updateId);
  }, []);

  const countLabel = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
  const loading = activity.type === 'loading';

  return (
    <header className="feed-header">
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
        The Daily Feed
      </h1>
      <div className="feed-header-meta">
        <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
          {today} · {countLabel}
        </p>
        <div className="flex items-center gap-2">
          {!loading && isCached && (
            <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--code-bg)', color: 'var(--foreground-subtle)' }}>
              Cached
            </span>
          )}
          <button
            type="button"
            aria-label="Refresh feeds"
            onClick={() => { if (!loading && activity.type !== 'empty') void onRefresh(); }}
            aria-disabled={loading || activity.type === 'empty'}
            className="feed-refresh-button neutral-action button-hover-fade"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M20 7v5h-5M4 17v-5h5" />
              <path d="M5.1 8a8 8 0 0 1 13.2-2L20 8M4 16l1.7 2A8 8 0 0 0 18.9 16" />
            </svg>
            Refresh feeds
          </button>
        </div>
      </div>
      {activity.type !== 'failed' && activity.type !== 'fallback' && <FeedActivity activity={activity} />}
    </header>
  );
}
