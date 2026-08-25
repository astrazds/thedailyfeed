interface FeedHeaderProps {
  today: string;
  itemCount: number;
  isCached?: boolean;
  loading?: boolean;
  completedFeeds?: number;
  totalFeeds?: number;
}

export function FeedHeader({
  today,
  itemCount,
  isCached = false,
  loading = false,
  completedFeeds = 0,
  totalFeeds = 0,
}: FeedHeaderProps) {
  const countLabel = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
  const showProgress = loading && totalFeeds > 0;
  const progressLabel = `${Math.min(completedFeeds, totalFeeds)}/${totalFeeds} feeds`;

  return (
    <header className="mb-12 pb-6" style={{ borderBottom: '1px solid var(--border-color)' }}>
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
        The Daily Feed
      </h1>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
          {today} · {loading ? `${countLabel} (loading more…)` : countLabel}
        </p>
        <div className="flex items-center gap-2">
          {showProgress && (
            <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--code-bg)', color: 'var(--foreground-subtle)' }}>
              {progressLabel}
            </span>
          )}
          {!loading && isCached && (
            <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--code-bg)', color: 'var(--foreground-subtle)' }}>
              Cached
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
