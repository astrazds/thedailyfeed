import type { Feed } from '@/lib/feed-storage';
import type { FeedManagerOperationResult } from '@/lib/feed-manager-operations';
import type { OPMLImportSummary } from '@/lib/opml';

export interface FeedManagerModalStatePatch {
  feeds: Feed[];
  newFeedName?: string;
  newFeedUrl?: string;
  editingId?: string | null;
  editName?: string;
  editUrl?: string;
  importStatus?: string | null;
}

export function formatImportSummary(summary: OPMLImportSummary): string {
  const details = [
    summary.skippedDuplicate > 0 ? `${summary.skippedDuplicate} duplicate` : null,
    summary.invalid > 0 ? `${summary.invalid} invalid` : null,
    summary.overLimit > 0 ? `${summary.overLimit} over limit` : null,
  ].filter((detail): detail is string => detail !== null);

  const feedLabel = summary.added === 1 ? 'feed' : 'feeds';
  return `Imported ${summary.added} ${feedLabel}${details.length > 0 ? `, skipped ${details.join(', ')}` : ''}`;
}

export function mapFeedManagerResultToModalState(
  result: FeedManagerOperationResult
): FeedManagerModalStatePatch {
  const patch: FeedManagerModalStatePatch = {
    feeds: result.feeds,
  };

  switch (result.mutation.type) {
    case 'add':
      patch.newFeedName = '';
      patch.newFeedUrl = '';
      return patch;
    case 'edit':
      patch.editingId = null;
      patch.editName = '';
      patch.editUrl = '';
      return patch;
    case 'toggle':
    case 'delete':
      return patch;
    case 'import-opml':
      if (result.mutation.importSummary !== undefined) {
        patch.importStatus = formatImportSummary(result.mutation.importSummary);
      }
      return patch;
  }
}
