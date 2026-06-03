import type { FeedItem } from '@/lib/rss';
import { FeedItemComponent } from './feed-item';

interface FeedListProps {
  items: FeedItem[];
}

export function FeedList({ items }: FeedListProps) {
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
    </div>
  );
}
