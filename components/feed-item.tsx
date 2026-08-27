import { memo } from 'react';
import { format } from 'date-fns';
import type { FeedItem } from '@/lib/rss';
import { CONTENT_MAX_LENGTH } from '@/lib/constants';
import { normalizeSafeArticleLink } from '@/lib/feed-link-policy';
import { ExpandableContent } from './expandable-content';

interface FeedItemProps {
  item: FeedItem;
}

export const FeedItemComponent = memo(function FeedItemComponent({ item }: FeedItemProps) {
  const timeString = format(item.pubDate, 'h:mm a');
  const safeArticleLink = normalizeSafeArticleLink(item.link);
  
  return (
    <article className="mb-12 pb-12 last:border-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
      <h2 className="text-xl mb-6">
        {safeArticleLink ? (
          <a 
            href={safeArticleLink}
            className="article-link"
          >
            {item.title}
          </a>
        ) : (
          <span>{item.title}</span>
        )}
      </h2>
      
      {item.contentHtml ? (
        <div className="mb-4">
          <ExpandableContent
            baseUrl={safeArticleLink}
            content={item.contentHtml}
            maxLength={CONTENT_MAX_LENGTH}
          />
        </div>
      ) : item.description ? (
        <p className="mb-4" style={{ lineHeight: '1.8', color: 'var(--foreground)' }}>
          {item.description}
        </p>
      ) : null}
      
      <div className="text-sm mt-3" style={{ color: 'var(--foreground-subtle)' }}>
        <span>{item.source}</span>
        {' · '}
        <time dateTime={item.pubDate.toISOString()}>
          {timeString}
        </time>
      </div>
    </article>
  );
});
