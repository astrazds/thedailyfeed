import type { FeedItem } from '@/lib/rss';
import { FeedItemComponent } from './feed-item';
import { FeedSkeleton } from './feed-skeleton';

interface FeedListProps {
  items: FeedItem[];
  loading?: boolean;
}

export function FeedList({ items, loading = false }: FeedListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-lg" style={{ color: 'var(--foreground-muted)' }}>
          Add feeds to see daily content
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {items.map((item) => (
        <FeedItemComponent 
          key={`${item.source}-${item.link}-${item.pubDate.getTime()}`}
          item={item} 
        />
      ))}
      {loading && <FeedSkeleton label="Loading more feed items" />}
    </div>
  );
}
