export function FeedSkeleton() {
  return (
    <div className="feed-loading-skeleton" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div className="feed-skeleton-item" key={index}>
          <div className="feed-skeleton-title" />
          <div className="feed-skeleton-excerpt">
            <span />
            <span />
            <span />
          </div>
          <div className="feed-skeleton-source" />
        </div>
      ))}
    </div>
  );
}
