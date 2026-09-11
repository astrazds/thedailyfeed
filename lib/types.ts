export interface FeedItem {
  title: string;
  link: string;
  pubDate: Date;
  description?: string;
  contentHtml?: string;
  source: string;
}

export type SerializedFeedItem = Omit<FeedItem, 'pubDate'> & { pubDate: string };

export interface FeedApiResponse {
  items: SerializedFeedItem[];
  cached: boolean;
  timeZone?: string;
}

export type FeedStreamStatus = 'cached' | 'success' | 'timeout' | 'error';

export type FeedProgressEvent<Item> =
  | {
      type: 'meta';
      requestId: string;
      cached: boolean;
      timeZone: string;
      totalFeeds: number;
      completedFeeds: number;
    }
  | {
      type: 'feed_result';
      requestId: string;
      cached: boolean;
      timeZone: string;
      totalFeeds: number;
      completedFeeds: number;
      feedUrl: string;
      status: FeedStreamStatus;
      itemCount: number;
      items: Item[];
    }
  | {
      type: 'done';
      requestId: string;
      cached: boolean;
      timeZone: string;
      totalFeeds: number;
      completedFeeds: number;
      totalItemCount: number;
    };

export type FeedStreamChunk =
  | FeedProgressEvent<SerializedFeedItem>
  | {
      type: 'error';
      requestId: string;
      error: string;
    };

/**
 * Error response from API
 */
export interface ApiErrorResponse {
  error: string;
  details?: string;
  invalidUrls?: string[];
}
