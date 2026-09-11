import type { FeedItem } from '@/lib/types';
import { FeedItemComponent } from './feed-item';
import { FeedSkeleton } from './feed-skeleton';

interface FeedListProps {
  items: FeedItem[];
  loading?: boolean;
}

export function FeedList({ items, loading = false }: FeedListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0">
      {items.map((item) => (
        <FeedItemComponent 
          key={`${item.source}-${item.link}-${item.pubDate.getTime()}`}
          item={item} 
        />
      ))}
      {loading && <FeedSkeleton />}
    </div>
  );
}
