import type { FeedItem } from '@/lib/types';
import { FeedItemComponent } from './feed-item';

interface FeedListProps {
  items: FeedItem[];
}

export function FeedList({ items }: FeedListProps) {
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
    </div>
  );
}
