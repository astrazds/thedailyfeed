import { useState } from 'react';
import {
  runFeedManagerOperation,
  FeedStorageError,
  FeedLimitError,
  type Feed,
  type FeedImportSummary,
} from '@/lib/feed-storage';
import { parseOPML, readOPMLFile } from '@/lib/opml';
import { logger } from '@/lib/logger';

type PendingOperation = { type: 'add' } | { type: 'edit'; feedId: string } | { type: 'import' };
type FormOperation = Pick<Feed, 'name' | 'url'> & ({ type: 'add' } | { type: 'edit'; id: string });
type OperationFailure = { type: PendingOperation['type'] | 'toggle' | 'delete'; message: string };

function mutationFailure(error: unknown, fallback: string): string {
  return error instanceof FeedStorageError || error instanceof FeedLimitError ? error.message : fallback;
}

function formatImportSummary(summary: FeedImportSummary): string {
  const details = [
    summary.skippedDuplicate > 0 ? `${summary.skippedDuplicate} duplicate` : null,
    summary.invalid > 0 ? `${summary.invalid} invalid` : null,
    summary.overLimit > 0 ? `${summary.overLimit} over limit` : null,
  ].filter(detail => detail !== null);
  const feedLabel = summary.added === 1 ? 'feed' : 'feeds';
  return `Imported ${summary.added} ${feedLabel}${details.length > 0 ? `, skipped ${details.join(', ')}` : ''}`;
}

async function validateFeedUrl(url: string): Promise<void> {
  const response = await fetch('/api/feeds/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error('Feed validation failed');
}

export function useFeedManagerActions({
  onFeedsChange,
  beforeListChange,
  onRefreshFeeds,
  isRefreshing,
}: {
  onFeedsChange: (feeds: Feed[]) => void;
  beforeListChange: () => void;
  onRefreshFeeds: () => Promise<void>;
  isRefreshing: boolean;
}) {
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [failure, setFailure] = useState<OperationFailure | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [refreshPending, setRefreshPending] = useState(false);

  const clearFailure = (type: OperationFailure['type']) => {
    setFailure(current => current?.type === type ? null : current);
  };

  const save = async (operation: FormOperation): Promise<boolean> => {
    if (pending) return false;
    setFailure(null);
    setPending(operation.type === 'edit' ? { type: 'edit', feedId: operation.id } : { type: 'add' });
    setStatusMessage(operation.type === 'add' ? 'Adding feed…' : 'Saving changes…');
    try {
      const result = await runFeedManagerOperation({ ...operation, validateFeedUrl });
      if (operation.type === 'edit') beforeListChange();
      onFeedsChange(result.feeds);
      setStatusMessage(operation.type === 'add' ? 'Feed added.' : 'Changes saved.');
      return true;
    } catch (error) {
      setStatusMessage('');
      setFailure({ type: operation.type, message: mutationFailure(error, operation.type === 'add'
        ? 'Unable to add this feed. Check that the URL points to a valid RSS or Atom feed, then try again.'
        : 'Unable to save these changes. Check the feed URL and try again.') });
      return false;
    } finally {
      setPending(null);
    }
  };

  const mutate = async (type: 'toggle' | 'delete', id: string): Promise<boolean> => {
    setFailure(null);
    setStatusMessage('');
    try {
      const result = await runFeedManagerOperation({ type, id });
      if (type === 'delete') beforeListChange();
      onFeedsChange(result.feeds);
      return true;
    } catch (error) {
      setFailure({ type, message: mutationFailure(error, 'Unable to save this change. Try again.') });
      return false;
    }
  };

  const importFile = async (file: File): Promise<void> => {
    if (pending) return;
    setFailure(null);
    setPending({ type: 'import' });
    setStatusMessage('Reading OPML file…');
    try {
      const feeds = parseOPML(await readOPMLFile(file));
      setStatusMessage(`Found ${feeds.length} feeds. Importing…`);
      const result = await runFeedManagerOperation({ type: 'import-opml', feeds });
      onFeedsChange(result.feeds);
      if (result.type === 'import-opml') setStatusMessage(formatImportSummary(result.summary));
    } catch (error) {
      logger.error('Import error', error instanceof Error ? error : new Error('Failed to import'));
      setStatusMessage('');
      setFailure({ type: 'import', message: mutationFailure(error,
        'Unable to import this OPML file. Choose a valid OPML or XML file and try again.') });
    } finally {
      setPending(null);
    }
  };

  const refresh = async (): Promise<void> => {
    if (refreshPending || isRefreshing) return;
    setRefreshPending(true);
    setStatusMessage('Refreshing feeds…');
    try {
      await onRefreshFeeds();
      setStatusMessage('Feed refresh complete.');
    } catch {
      setStatusMessage('Unable to refresh feeds. Try again.');
    } finally {
      setRefreshPending(false);
    }
  };

  return { pending, failure, statusMessage, refreshPending, clearFailure, save, mutate, importFile, refresh };
}

export type FeedManagerActions = ReturnType<typeof useFeedManagerActions>;
