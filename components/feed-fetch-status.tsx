import type { FeedStreamStatus } from '@/lib/types';

export interface FeedFetchStatusItem {
  feedUrl: string;
  feedName: string;
  status: 'pending' | FeedStreamStatus;
  itemCount: number;
}

interface FeedFetchStatusProps {
  loading: boolean;
  items: FeedFetchStatusItem[];
}

function getStatusLabel(item: FeedFetchStatusItem): string {
  if (item.status === 'pending') {
    return 'Loading';
  }

  if (item.status === 'cached') {
    return `Cached (${item.itemCount})`;
  }

  if (item.status === 'success') {
    return `Loaded (${item.itemCount})`;
  }

  if (item.status === 'timeout') {
    return 'Timed out';
  }

  return 'Error';
}

function getStatusColor(status: FeedFetchStatusItem['status']): string {
  if (status === 'success' || status === 'cached') {
    return 'var(--foreground-subtle)';
  }

  if (status === 'timeout' || status === 'error') {
    return 'var(--accent-primary)';
  }

  return 'var(--foreground-muted)';
}

export function FeedFetchStatus({ loading, items }: FeedFetchStatusProps) {
  if (!loading || items.length === 0) {
    return null;
  }

  return (
    <section className="mb-6">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item.feedUrl}
            className="text-xs px-2 py-1 rounded"
            style={{
              backgroundColor: 'var(--code-bg)',
              color: getStatusColor(item.status),
            }}
            title={item.feedUrl}
          >
            {item.feedName}: {getStatusLabel(item)}
          </span>
        ))}
      </div>
    </section>
  );
}
