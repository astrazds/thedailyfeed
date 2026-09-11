const SKELETON_WIDTHS = ['75%', '85%'];

export function FeedSkeleton() {
  return (
    <div className="feed-loading-skeleton space-y-12" aria-hidden="true">
      {SKELETON_WIDTHS.map((width) => (
        <article key={width} className="pb-12" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div
            className="h-6 rounded mb-6"
            style={{
              backgroundColor: 'var(--code-bg)',
              width,
            }}
          />
          <div className="space-y-3 mb-4">
            <div className="h-4 rounded" style={{ backgroundColor: 'var(--code-bg)', width: '100%' }} />
            <div className="h-4 rounded" style={{ backgroundColor: 'var(--code-bg)', width: '95%' }} />
            <div className="h-4 rounded" style={{ backgroundColor: 'var(--code-bg)', width: '88%' }} />
            <div className="h-4 rounded" style={{ backgroundColor: 'var(--code-bg)', width: '92%' }} />
          </div>
          <div className="h-3 rounded" style={{ backgroundColor: 'var(--code-bg)', width: '25%' }} />
        </article>
      ))}
    </div>
  );
}
