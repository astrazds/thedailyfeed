import type { ReactNode } from 'react';
import type { Feed, FeedImportEntry } from '../../../lib/feed-storage';

export function OpmlInput({ children, onImport }: {
  disabled: boolean;
  onImport: (read: () => Promise<FeedImportEntry[]>) => Promise<void>;
  children: (choose: () => void) => ReactNode;
}) {
  return children(() => { void onImport(async () => { throw new Error('OPML transfer is available on web.'); }); });
}

export function exportSubscriptions(_feeds: Feed[]): void {
  throw new Error('OPML transfer is available on web.');
}
