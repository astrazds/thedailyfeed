/**
 * Loading skeleton for feed items
 * Improves perceived performance during loading
 */

// Fixed widths to avoid hydration mismatch
const SKELETON_WIDTHS = ['75%', '85%', '68%'];

export function FeedSkeleton() {
  return (
    <div className="space-y-12 animate-pulse" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <article key={i} className="pb-12" style={{ borderBottom: '1px solid var(--border-color)' }}>
            {/* Title skeleton */}
            <div
              className="h-6 rounded mb-6"
              style={{
                backgroundColor: 'var(--code-bg)',
                width: SKELETON_WIDTHS[i - 1],
              }}
            />

            {/* Content skeleton */}
            <div className="space-y-3 mb-4">
              <div className="h-4 rounded" style={{ backgroundColor: 'var(--code-bg)', width: '100%' }} />
              <div className="h-4 rounded" style={{ backgroundColor: 'var(--code-bg)', width: '95%' }} />
              <div className="h-4 rounded" style={{ backgroundColor: 'var(--code-bg)', width: '88%' }} />
              <div className="h-4 rounded" style={{ backgroundColor: 'var(--code-bg)', width: '92%' }} />
            </div>

            {/* Meta skeleton */}
            <div className="h-3 rounded" style={{ backgroundColor: 'var(--code-bg)', width: '25%' }} />
          </article>
        ))}
    </div>
  );
}
