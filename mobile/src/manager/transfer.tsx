import { useRef } from 'react';
import type { Feed, FeedImportEntry } from '../../../lib/feed-storage';
import { downloadOPML, exportToOPML, parseOPML, readOPMLFile } from '../../../lib/opml';
import type { ReaderPalette } from '../contracts';
import { Action } from './controls';

export function OpmlInput({ palette, disabled, onImport, onChoose }: {
  palette: ReaderPalette;
  disabled: boolean;
  onImport: (read: () => Promise<FeedImportEntry[]>) => Promise<void>;
  onChoose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return <>
    <Action palette={palette} disabled={disabled} small={false} style={{ paddingHorizontal: 16 }} onPress={() => {
      if (disabled) return;
      onChoose();
      ref.current?.click();
    }}>Import OPML</Action>
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
