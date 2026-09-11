import { useRef, type ChangeEvent } from 'react';
import type { Feed } from '@/lib/feed-storage';
import { downloadOPML, exportToOPML } from '@/lib/opml';
import type { FeedManagerActions } from './use-feed-manager-actions';

export function FeedManagerTransfer({ feeds, actions }: { feeds: Feed[]; actions: FeedManagerActions }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImportClick = () => {
    actions.clearFailure('import');
    fileInputRef.current?.click();
  };
  const handleExportOPML = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    downloadOPML(exportToOPML(feeds), `daily-feed-${timestamp}.opml`);
  };
  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || actions.pending) return;
    try {
      await actions.importFile(file);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  return (
    <details className="mt-3">
      <summary className="neutral-action cursor-pointer px-4 py-3 rounded font-semibold">
        Import and export
      </summary>
      <div className="flex gap-3 flex-wrap mt-4">
        <button
          type="button"
          onClick={handleImportClick}
          disabled={actions.pending !== null}
          className="neutral-action px-4 py-2 rounded font-medium button-hover-fade disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Import OPML
        </button>
        <button
          type="button"
          onClick={handleExportOPML}
          disabled={actions.pending !== null}
          className="neutral-action px-4 py-2 rounded font-medium button-hover-fade disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export OPML
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".opml,.xml"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Choose OPML file"
      />
      {actions.failure?.type === 'import' && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--status-error)' }}>
          {actions.failure.message}
        </p>
      )}
    </details>
  );
}
