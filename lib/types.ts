/**
 * Shared type definitions
 */

/**
 * API response from /api/feeds endpoint
 */
export interface FeedApiResponse {
  items: Array<{
    title: string;
    link: string;
    pubDate: string; // ISO date string
    description?: string;
    contentHtml?: string;
    source: string;
  }>;
  cached: boolean;
  timeZone?: string;
}

export type FeedStreamStatus = 'cached' | 'success' | 'timeout' | 'error';

export type FeedStreamChunk =
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
      items: FeedApiResponse['items'];
    }
  | {
      type: 'done';
      requestId: string;
      cached: boolean;
      timeZone: string;
      totalFeeds: number;
      completedFeeds: number;
      totalItemCount: number;
    }
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
