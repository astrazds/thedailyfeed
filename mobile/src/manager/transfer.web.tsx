import { useRef, type ReactNode } from 'react';
import type { Feed, FeedImportEntry } from '../../../lib/feed-storage';
import { downloadOPML, exportToOPML, parseOPML, readOPMLFile } from '../../../lib/opml';

export function OpmlInput({ disabled, onImport, children }: {
  disabled: boolean;
  onImport: (read: () => Promise<FeedImportEntry[]>) => Promise<void>;
  children: (choose: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return <>
    {children(() => { if (!disabled) ref.current?.click(); })}
    <input ref={ref} type="file" accept=".opml,.xml" aria-label="Choose OPML file" hidden disabled={disabled}
      onChange={async event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file && !disabled) await onImport(async () => parseOPML(await readOPMLFile(file)));
      }} />
  </>;
}

export function exportSubscriptions(feeds: Feed[]) {
  downloadOPML(exportToOPML(feeds), `daily-feed-${new Date().toISOString().split('T')[0]}.opml`);
}
