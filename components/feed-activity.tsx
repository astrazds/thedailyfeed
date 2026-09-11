import type { FeedLoadActivity } from '@/lib/feed-load-activity';

export function FeedActivity({ activity }: { activity: FeedLoadActivity }) {
  if (activity.type === 'empty') return null;
  const loading = activity.type === 'loading';
  return (
    <div className={`feed-activity feed-activity-${activity.type}`}>
      <div className="feed-activity-copy">
        {loading && <span className="feed-loading-spinner" aria-hidden="true" />}
        <div>
          <p className="feed-activity-title">{activity.title}</p>
          <p className="feed-activity-detail">{activity.detail}</p>
        </div>
      </div>
      {loading && (
        <progress
          className="feed-loading-progress"
          aria-label="Feed loading progress"
          max={activity.total > 0 ? activity.total : undefined}
          value={activity.total > 0 ? activity.completed : undefined}
        />
      )}
    </div>
  );
}
