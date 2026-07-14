'use client';

import { useState, useEffect, useRef } from 'react';
import type { Feed } from '@/lib/feed-storage';
import {
  exportToOPML,
  parseOPML,
  downloadOPML,
  readOPMLFile,
} from '@/lib/opml';
import {
  runFeedManagerOperation,
  type FeedManagerOperationResult,
} from '@/lib/feed-storage';
import { mapFeedManagerResultToModalState } from '@/components/feed-manager-modal-state';
import { logger } from '@/lib/logger';
import type { FeedSetLifecycleStatusItem } from '@/lib/feed-set-lifecycle';

interface FeedManagerModalProps {
  feeds: Feed[];
  feedStatuses?: FeedSetLifecycleStatusItem[];
  isOpen: boolean;
  onFeedsChange: (feeds: Feed[]) => void;
  onClose: () => void;
}

export function FeedManagerModal({
  feeds,
  feedStatuses = [],
  isOpen,
  onFeedsChange,
  onClose,
}: FeedManagerModalProps) {
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedName, setNewFeedName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const validateFeedUrl = async (url: string): Promise<void> => {
    const response = await fetch('/api/feeds/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      let message = 'Feed validation failed';
      try {
        const payload = await response.json();
        if (payload?.error && typeof payload.error === 'string') {
          message = payload.error;
        }
      } catch {
        // Ignore parse errors and keep the default message.
      }
      throw new Error(message);
    }
  };

  const applyOperationResult = (result: FeedManagerOperationResult) => {
    const statePatch = mapFeedManagerResultToModalState(result);
    onFeedsChange(statePatch.feeds);

    if (statePatch.newFeedName !== undefined) {
      setNewFeedName(statePatch.newFeedName);
    }
    if (statePatch.newFeedUrl !== undefined) {
      setNewFeedUrl(statePatch.newFeedUrl);
    }
    if (statePatch.editingId !== undefined) {
      setEditingId(statePatch.editingId);
    }
    if (statePatch.editName !== undefined) {
      setEditName(statePatch.editName);
    }
    if (statePatch.editUrl !== undefined) {
      setEditUrl(statePatch.editUrl);
    }
    if (statePatch.importStatus !== undefined) {
      setImportStatus(statePatch.importStatus);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const focusTimer = setTimeout(() => closeButtonRef.current?.focus(), 100);
    return () => clearTimeout(focusTimer);
  }, [isOpen]);

  // Handle ESC key and focus trap
  useEffect(() => {
    if (!isOpen) return;

    const modal = modalRef.current;
    if (!modal) return;

    // Handle ESC key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Trap focus within modal
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = modal.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements.length === 0) return;
      
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleTab);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTab);
    };
  }, [isOpen, onClose]);

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeedUrl.trim() || !newFeedName.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await runFeedManagerOperation({
        type: 'add',
        name: newFeedName,
        url: newFeedUrl,
        validateFeedUrl,
      });
      applyOperationResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add feed';
      setImportStatus(`Error: ${message}`);
      setTimeout(() => setImportStatus(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    const result = await runFeedManagerOperation({
      type: 'toggle',
      id,
    });
    applyOperationResult(result);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this feed?')) {
      const result = await runFeedManagerOperation({
        type: 'delete',
        id,
      });
      applyOperationResult(result);
    }
  };

  const handleEdit = (feed: Feed) => {
    setEditingId(feed.id);
    setEditName(feed.name);
    setEditUrl(feed.url);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim() || !editUrl.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await runFeedManagerOperation({
        type: 'edit',
        id: editingId,
        name: editName,
        url: editUrl,
        validateFeedUrl,
      });
      applyOperationResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update feed';
      setImportStatus(`Error: ${message}`);
      setTimeout(() => setImportStatus(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditUrl('');
  };

  const handleClose = () => {
    onClose();
  };

  const handleExportOPML = () => {
    const opmlContent = exportToOPML(feeds);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadOPML(opmlContent, `daily-feed-${timestamp}.opml`);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus('Reading file...');

    try {
      const content = await readOPMLFile(file);
      const importedFeeds = parseOPML(content);
      
      setImportStatus(`Found ${importedFeeds.length} feeds. Importing...`);

      const result = await runFeedManagerOperation({
        type: 'import-opml',
        feeds: importedFeeds,
      });
      applyOperationResult(result);
      
      // Clear status after 3 seconds
      setTimeout(() => setImportStatus(null), 3000);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to import');
      logger.error('Import error', err);
      setImportStatus(`Error: ${err.message}`);
      setTimeout(() => setImportStatus(null), 5000);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        ref={modalRef}
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-lg shadow-2xl"
        style={{ backgroundColor: 'var(--background)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="px-6 py-4 border-b"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center justify-between">
            <h2 id="modal-title" className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
              Manage Feeds
            </h2>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="text-2xl leading-none"
              style={{ color: 'var(--foreground-muted)' }}
              aria-label="Close modal (press Escape)"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)] px-6 py-4">
          {/* Import/Export Section */}
          <div className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
              Import / Export
            </h3>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleImportClick}
                className="px-4 py-2 rounded font-medium transition-colors button-hover-fade"
                style={{
                  backgroundColor: 'var(--code-bg)',
                  color: 'var(--foreground)',
                }}
              >
                📥 Import OPML
              </button>
              <button
                onClick={handleExportOPML}
                className="px-4 py-2 rounded font-medium transition-colors button-hover-fade"
                style={{
                  backgroundColor: 'var(--code-bg)',
                  color: 'var(--foreground)',
                }}
              >
                📤 Export OPML
              </button>
              {importStatus && (
                <div 
                  className="px-4 py-2 rounded text-sm flex-1 min-w-[200px]"
                  style={{
                    backgroundColor: importStatus.includes('Error') ? 'var(--code-bg)' : 'var(--accent-primary)',
                    color: importStatus.includes('Error') ? 'var(--accent-primary)' : 'var(--background)',
                  }}
                >
                  {importStatus}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Add New Feed Form */}
          <form onSubmit={handleAddFeed} className="mb-6">
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
              Add New Feed
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Feed Name (e.g., TechCrunch)"
                value={newFeedName}
                onChange={(e) => setNewFeedName(e.target.value)}
                className="w-full px-4 py-2 rounded border"
                style={{
                  backgroundColor: 'var(--background)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--foreground)',
                }}
              />
              <input
                type="url"
                placeholder="RSS Feed URL"
                value={newFeedUrl}
                onChange={(e) => setNewFeedUrl(e.target.value)}
                className="w-full px-4 py-2 rounded border"
                style={{
                  backgroundColor: 'var(--background)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--foreground)',
                }}
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 rounded font-medium transition-colors button-hover-fade disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--background)',
                }}
              >
                {isSubmitting ? 'Validating...' : 'Add Feed'}
              </button>
            </div>
          </form>

          {/* Feed List */}
          <div>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
              Your Feeds ({feeds.length})
            </h3>
            <div className="space-y-3">
              {feeds.map((feed) => (
                <div
                  key={feed.id}
                  className="p-4 rounded border"
                  style={{
                    borderColor: 'var(--border-color)',
                    backgroundColor: feed.enabled ? 'transparent' : 'var(--code-bg)',
                  }}
                >
                  {editingId === feed.id ? (
                    // Edit Mode
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-1 rounded border text-sm"
                        style={{
                          backgroundColor: 'var(--background)',
                          borderColor: 'var(--border-color)',
                          color: 'var(--foreground)',
                        }}
                      />
                      <input
                        type="url"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="w-full px-3 py-1 rounded border text-sm"
                        style={{
                          backgroundColor: 'var(--background)',
                          borderColor: 'var(--border-color)',
                          color: 'var(--foreground)',
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={isSubmitting}
                          className="px-4 py-1 rounded text-sm"
                          style={{
                            backgroundColor: 'var(--accent-primary)',
                            color: 'var(--background)',
                          }}
                        >
                          {isSubmitting ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-4 py-1 rounded text-sm"
                          style={{
                            backgroundColor: 'var(--code-bg)',
                            color: 'var(--foreground)',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold" style={{ color: 'var(--foreground)' }}>
                            {feed.name}
                          </h4>
                          {feed.enabled &&
                            (feedStatuses.find((item) => item.feedUrl === feed.url)?.status === 'success' ||
                              feedStatuses.find((item) => item.feedUrl === feed.url)?.status === 'cached') && (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ color: 'green' }}
                                aria-label="Loaded successfully"
                                role="img"
                              >
                                <path d="M3 8.5 6.5 12 13 4" />
                              </svg>
                            )}
                          {feed.enabled &&
                            (feedStatuses.find((item) => item.feedUrl === feed.url)?.status === 'error' ||
                              feedStatuses.find((item) => item.feedUrl === feed.url)?.status === 'timeout') && (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                style={{ color: 'red' }}
                                aria-label="Failed to load"
                                role="img"
                              >
                                <path d="M4 4 12 12M12 4 4 12" />
                              </svg>
                            )}
                          {!feed.enabled && (
                            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--code-bg)', color: 'var(--foreground-subtle)' }}>
                              Disabled
                            </span>
                          )}
                        </div>
                        <p className="text-sm truncate" style={{ color: 'var(--foreground-muted)' }}>
                          {feed.url}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleToggle(feed.id)}
                          className="px-3 py-1 rounded text-sm transition-colors button-hover-fade"
                          style={{
                            backgroundColor: feed.enabled ? 'var(--code-bg)' : 'var(--accent-primary)',
                            color: feed.enabled ? 'var(--foreground)' : 'var(--background)',
                          }}
                        >
                          {feed.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleEdit(feed)}
                          className="px-3 py-1 rounded text-sm"
                          style={{
                            backgroundColor: 'var(--code-bg)',
                            color: 'var(--foreground)',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(feed.id)}
                          className="px-3 py-1 rounded text-sm"
                          style={{
                            backgroundColor: 'var(--code-bg)',
                            color: 'var(--accent-primary)',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div 
          className="px-6 py-4 border-t flex justify-end"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <button
            onClick={handleClose}
            className="px-6 py-2 rounded font-medium"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--background)',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
