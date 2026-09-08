'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
} from 'react';
import type { Feed } from '@/lib/feed-storage';
import {
  exportToOPML,
  parseOPML,
  downloadOPML,
  readOPMLFile,
} from '@/lib/opml';
import {
  runFeedManagerOperation,
  FeedStorageError,
  FeedLimitError,
  type FeedManagerOperationResult,
} from '@/lib/feed-storage';
import { mapFeedManagerResultToModalState } from '@/components/feed-manager-modal-state';
import {
  FeedDeleteActions,
  focusAfterUpdate,
  focusPendingTarget,
} from '@/components/feed-delete-actions';
import { logger } from '@/lib/logger';
import type { FeedSetLifecycleStatusItem } from '@/lib/feed-set-lifecycle';

interface FeedManagerModalProps {
  feeds: Feed[];
  feedStatuses?: FeedSetLifecycleStatusItem[];
  isOpen: boolean;
  isRefreshing: boolean;
  onRefreshFeeds: () => Promise<void>;
  onFeedsChange: (feeds: Feed[]) => void;
  onClose: () => void;
}

export type PendingOperation =
  | { type: 'add' }
  | { type: 'edit'; feedId: string }
  | { type: 'import' };

type OperationFailure = {
  type: PendingOperation['type'] | 'toggle' | 'delete';
  message: string;
};

interface FieldErrors {
  name: string | null;
  url: string | null;
}

const EMPTY_FIELD_ERRORS: FieldErrors = { name: null, url: null };
const ADD_FAILURE =
  'Unable to add this feed. Check that the URL points to a valid RSS or Atom feed, then try again.';
const EDIT_FAILURE =
  'Unable to save these changes. Check the feed URL and try again.';
const IMPORT_FAILURE =
  'Unable to import this OPML file. Choose a valid OPML or XML file and try again.';

function mutationFailure(error: unknown, fallback: string): string {
  return error instanceof FeedStorageError || error instanceof FeedLimitError ? error.message : fallback;
}

function validateFields(name: string, url: string): FieldErrors {
  const errors: FieldErrors = {
    name: name.trim() ? null : 'Enter a feed name.',
    url: null,
  };
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    errors.url = 'Enter a feed URL.';
    return errors;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      errors.url = 'Enter an HTTP or HTTPS feed URL.';
    }
  } catch {
    errors.url = 'Enter a valid feed URL.';
  }

  return errors;
}

function hasFieldErrors(errors: FieldErrors): boolean {
  return errors.name !== null || errors.url !== null;
}

export function getFeedManagerSubmitTone(
  action: 'add' | 'save',
  isEditing: boolean
): 'primary-action' | 'neutral-action' {
  return action === 'save' || !isEditing ? 'primary-action' : 'neutral-action';
}

export function getFeedManagerPendingState(
  pendingOperation: PendingOperation | null,
  editingId: string | null
): { addPending: boolean; editPending: boolean } {
  return {
    addPending: pendingOperation?.type === 'add',
    editPending:
      pendingOperation?.type === 'edit' && pendingOperation.feedId === editingId,
  };
}

function FeedLoadStatusIndicator({
  enabled,
  status,
}: {
  enabled: boolean;
  status: FeedSetLifecycleStatusItem['status'] | undefined;
}) {
  if (!enabled) {
    return null;
  }

  if (status === 'success' || status === 'cached') {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: 'var(--status-success)' }}
        aria-label="Loaded successfully"
        role="img"
      >
        <path d="M3 8.5 6.5 12 13 4" />
      </svg>
    );
  }

  if (status !== 'error' && status !== 'timeout') {
    return null;
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium"
      style={{ color: 'var(--status-error)' }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M4 4 12 12M12 4 4 12" />
      </svg>
      <span>{status === 'timeout' ? 'Timed out' : 'Failed to load'}</span>
    </span>
  );
}

export function FeedManagerModal({
  feeds,
  feedStatuses = [],
  isOpen,
  isRefreshing,
  onRefreshFeeds,
  onFeedsChange,
  onClose,
}: FeedManagerModalProps) {
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedName, setNewFeedName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [operationFailure, setOperationFailure] = useState<OperationFailure | null>(null);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null);
  const [refreshRecoveryPending, setRefreshRecoveryPending] = useState(false);
  const [addErrors, setAddErrors] = useState<FieldErrors>(EMPTY_FIELD_ERRORS);
  const [editErrors, setEditErrors] = useState<FieldErrors>(EMPTY_FIELD_ERRORS);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const newFeedNameRef = useRef<HTMLInputElement>(null);
  const newFeedUrlRef = useRef<HTMLInputElement>(null);
  const editNameRef = useRef<HTMLInputElement>(null);
  const editUrlRef = useRef<HTMLInputElement>(null);
  const feedListHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingFeedListFocusRef = useRef(false);

  const validateFeedUrl = async (url: string): Promise<void> => {
    const response = await fetch('/api/feeds/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error('Feed validation failed');
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
      setStatusMessage(statePatch.importStatus ?? '');
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isOpen && !dialog.open) {
      dialog.showModal();
      closeButtonRef.current?.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    focusPendingTarget(pendingFeedListFocusRef, feedListHeadingRef.current);
  }, [feeds]);

  const handleDialogClose = () => {
    if (isOpen) {
      onClose();
    }
  };

  const handleDialogBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    const dialog = event.currentTarget;
    const bounds = dialog.getBoundingClientRect();
    const isOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    if (isOutside) {
      dialog.close();
    }
  };

  const clearFailureFor = (type: OperationFailure['type']) => {
    setOperationFailure((current) => (current?.type === type ? null : current));
  };

  const handleAddNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setNewFeedName(value);
    clearFailureFor('add');
    if (addErrors.name && value.trim()) {
      setAddErrors((current) => ({ ...current, name: null }));
    }
  };

  const handleAddUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setNewFeedUrl(value);
    clearFailureFor('add');
    if (addErrors.url && !validateFields(newFeedName || 'name', value).url) {
      setAddErrors((current) => ({ ...current, url: null }));
    }
  };

  const handleAddFeed = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingOperation) {
      return;
    }

    const errors = validateFields(newFeedName, newFeedUrl);
    setAddErrors(errors);
    if (hasFieldErrors(errors)) {
      (errors.name ? newFeedNameRef : newFeedUrlRef).current?.focus();
      return;
    }

    setOperationFailure(null);
    setPendingOperation({ type: 'add' });
    setStatusMessage('Adding feed…');
    try {
      const result = await runFeedManagerOperation({
        type: 'add',
        name: newFeedName.trim(),
        url: newFeedUrl.trim(),
        validateFeedUrl,
      });
      applyOperationResult(result);
      setAddErrors(EMPTY_FIELD_ERRORS);
      setStatusMessage('Feed added.');
    } catch (error) {
      setStatusMessage('');
      setOperationFailure({ type: 'add', message: mutationFailure(error, ADD_FAILURE) });
    } finally {
      setPendingOperation(null);
    }
  };

  const handleSimpleMutation = async (type: 'toggle' | 'delete', id: string) => {
    setOperationFailure(null);
    setStatusMessage('');
    try {
      const result = await runFeedManagerOperation({ type, id });
      if (type === 'delete') pendingFeedListFocusRef.current = true;
      applyOperationResult(result);
      if (type === 'delete') setDeletingId(null);
    } catch (error) {
      setOperationFailure({ type, message: mutationFailure(error, 'Unable to save this change. Try again.') });
    }
  };

  const handleToggle = (id: string) => handleSimpleMutation('toggle', id);
  const beginDeleteConfirmation = (id: string) => setDeletingId(id);
  const handleConfirmDelete = (id: string) => handleSimpleMutation('delete', id);

  const handleEdit = (feed: Feed) => {
    setEditingId(feed.id);
    setEditName(feed.name);
    setEditUrl(feed.url);
    setEditErrors(EMPTY_FIELD_ERRORS);
    clearFailureFor('edit');
    focusAfterUpdate(() => editNameRef.current);
  };

  const handleEditNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setEditName(value);
    clearFailureFor('edit');
    if (editErrors.name && value.trim()) {
      setEditErrors((current) => ({ ...current, name: null }));
    }
  };

  const handleEditUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setEditUrl(value);
    clearFailureFor('edit');
    if (editErrors.url && !validateFields(editName || 'name', value).url) {
      setEditErrors((current) => ({ ...current, url: null }));
    }
  };

  const handleSaveEdit = async (
    event: FormEvent<HTMLFormElement>,
    feedId: string
  ) => {
    event.preventDefault();
    if (pendingOperation || editingId !== feedId) {
      return;
    }

    const errors = validateFields(editName, editUrl);
    setEditErrors(errors);
    if (hasFieldErrors(errors)) {
      (errors.name ? editNameRef : editUrlRef).current?.focus();
      return;
    }

    setOperationFailure(null);
    setPendingOperation({ type: 'edit', feedId });
    setStatusMessage('Saving changes…');
    try {
      const result = await runFeedManagerOperation({
        type: 'edit',
        id: feedId,
        name: editName.trim(),
        url: editUrl.trim(),
        validateFeedUrl,
      });
      pendingFeedListFocusRef.current = true;
      applyOperationResult(result);
      setEditErrors(EMPTY_FIELD_ERRORS);
      setStatusMessage('Changes saved.');
    } catch (error) {
      setStatusMessage('');
      setOperationFailure({ type: 'edit', message: mutationFailure(error, EDIT_FAILURE) });
    } finally {
      setPendingOperation(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditUrl('');
    setEditErrors(EMPTY_FIELD_ERRORS);
    clearFailureFor('edit');
    focusAfterUpdate(() => feedListHeadingRef.current);
  };

  const handleClose = () => {
    dialogRef.current?.close();
  };

  const handleExportOPML = () => {
    const opmlContent = exportToOPML(feeds);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadOPML(opmlContent, `daily-feed-${timestamp}.opml`);
  };

  const handleImportClick = () => {
    clearFailureFor('import');
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || pendingOperation) {
      return;
    }

    setOperationFailure(null);
    setPendingOperation({ type: 'import' });
    setStatusMessage('Reading OPML file…');

    try {
      const content = await readOPMLFile(file);
      const importedFeeds = parseOPML(content);
      setStatusMessage(`Found ${importedFeeds.length} feeds. Importing…`);

      const result = await runFeedManagerOperation({
        type: 'import-opml',
        feeds: importedFeeds,
      });
      applyOperationResult(result);
    } catch (error) {
      const resolvedError = error instanceof Error ? error : new Error('Failed to import');
      logger.error('Import error', resolvedError);
      setStatusMessage('');
      setOperationFailure({ type: 'import', message: mutationFailure(error, IMPORT_FAILURE) });
    } finally {
      setPendingOperation(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRefreshFeeds = async () => {
    if (refreshRecoveryPending || isRefreshing) {
      return;
    }

    setRefreshRecoveryPending(true);
    setStatusMessage('Refreshing feeds…');
    try {
      await onRefreshFeeds();
      setStatusMessage('Feed refresh complete.');
    } catch {
      setStatusMessage('Unable to refresh feeds. Try again.');
    } finally {
      setRefreshRecoveryPending(false);
      focusAfterUpdate(() => feedListHeadingRef.current);
    }
  };

  const { addPending, editPending } = getFeedManagerPendingState(
    pendingOperation,
    editingId
  );
  const anyPending = pendingOperation !== null;
  const refreshBusy = refreshRecoveryPending || isRefreshing;
  const hasFeedFailures = feedStatuses.some(
    (item) => item.status === 'error' || item.status === 'timeout'
  );
  const showFeedRecovery = hasFeedFailures || refreshRecoveryPending;

  return (
    <dialog
      ref={dialogRef}
      id="feed-manager-dialog"
      className="feed-manager-dialog rounded-lg shadow-2xl"
      aria-labelledby="feed-manager-title"
      onClose={handleDialogClose}
      onClick={handleDialogBackdropClick}
    >
      <div
        className="px-4 sm:px-6 py-4 border-b shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="feed-manager-title" className="text-2xl font-bold">
            Manage feeds
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            className="text-2xl leading-none min-w-10 min-h-10"
            style={{ color: 'var(--foreground-muted)' }}
            aria-label="Close feed manager"
          >
            ×
          </button>
        </div>
      </div>

      <div className="overflow-y-auto overscroll-contain min-h-0 flex-1 px-4 sm:px-6 py-4">
        <details open={feeds.length === 0 ? true : undefined}>
          <summary className="neutral-action cursor-pointer px-4 py-3 rounded font-semibold">
            Add feed
          </summary>
          <form
            onSubmit={handleAddFeed}
            className="mt-4"
            aria-busy={addPending}
            noValidate
          >
            <div className="space-y-3">
              <div>
                <label htmlFor="new-feed-name" className="block text-sm font-medium mb-1">
                  Feed name
                </label>
                <input
                  ref={newFeedNameRef}
                  id="new-feed-name"
                  name="feed-name"
                  type="text"
                  required
                  readOnly={addPending}
                  placeholder="Example News"
                  value={newFeedName}
                  onChange={handleAddNameChange}
                  aria-invalid={addErrors.name !== null}
                  aria-describedby="new-feed-name-error"
                  className="w-full px-4 py-2 rounded border text-base sm:text-sm"
                  style={{
                    backgroundColor: 'var(--background)',
                    borderColor: 'var(--control-border)',
                    color: 'var(--foreground)',
                  }}
                />
                <p id="new-feed-name-error" className="mt-1 text-sm" style={{ color: 'var(--status-error)' }}>
                  {addErrors.name}
                </p>
              </div>
              <div>
                <label htmlFor="new-feed-url" className="block text-sm font-medium mb-1">
                  Feed URL
                </label>
                <input
                  ref={newFeedUrlRef}
                  id="new-feed-url"
                  name="feed-url"
                  type="url"
                  inputMode="url"
                  required
                  readOnly={addPending}
                  placeholder="https://example.com/feed.xml"
                  value={newFeedUrl}
                  onChange={handleAddUrlChange}
                  aria-invalid={addErrors.url !== null}
                  aria-describedby="new-feed-url-error"
                  className="w-full px-4 py-2 rounded border text-base sm:text-sm"
                  style={{
                    backgroundColor: 'var(--background)',
                    borderColor: 'var(--control-border)',
                    color: 'var(--foreground)',
                  }}
                />
                <p id="new-feed-url-error" className="mt-1 text-sm" style={{ color: 'var(--status-error)' }}>
                  {addErrors.url}
                </p>
              </div>
              {operationFailure?.type === 'add' && (
                <p role="alert" className="text-sm" style={{ color: 'var(--status-error)' }}>
                  {operationFailure.message}
                </p>
              )}
              <button
                type="submit"
                disabled={anyPending}
                className={`${getFeedManagerSubmitTone('add', editingId !== null)} px-6 py-2 rounded font-medium button-hover-fade disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {addPending ? 'Add feed…' : 'Add feed'}
              </button>
            </div>
          </form>
        </details>

        <details className="mt-3">
          <summary className="neutral-action cursor-pointer px-4 py-3 rounded font-semibold">
            Import and export
          </summary>
          <div className="flex gap-3 flex-wrap mt-4">
            <button
              type="button"
              onClick={handleImportClick}
              disabled={anyPending}
              className="neutral-action px-4 py-2 rounded font-medium button-hover-fade disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import OPML
            </button>
            <button
              type="button"
              onClick={handleExportOPML}
              disabled={anyPending}
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
          {operationFailure?.type === 'import' && (
            <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--status-error)' }}>
              {operationFailure.message}
            </p>
          )}
        </details>

        <section aria-labelledby="feed-list-title" className="mt-6">
          <h3
            ref={feedListHeadingRef}
            id="feed-list-title"
            tabIndex={-1}
            className="text-lg font-semibold mb-3"
          >
            Feeds ({feeds.length})
          </h3>
          {(operationFailure?.type === 'toggle' || operationFailure?.type === 'delete') && (
            <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--status-error)' }}>
              {operationFailure.message}
            </p>
          )}
          {showFeedRecovery && (
            <div
              className="mb-4 p-4 rounded"
              style={{ backgroundColor: 'var(--code-bg)' }}
            >
              <p className="mb-3">
                Some feeds did not load. Try all feeds again, or edit a feed if its URL changed.
              </p>
              <button
                type="button"
                onClick={handleRefreshFeeds}
                disabled={refreshBusy}
                className="neutral-action px-4 py-2 rounded text-sm font-medium button-hover-fade disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {refreshBusy ? 'Refreshing feeds…' : 'Try all feeds again'}
              </button>
            </div>
          )}
          <div className="space-y-3">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="p-4 rounded border"
                style={{
                  borderColor: 'var(--control-border)',
                  backgroundColor: feed.enabled ? 'transparent' : 'var(--code-bg)',
                }}
              >
                {editingId === feed.id ? (
                  <form
                    onSubmit={(event) => handleSaveEdit(event, feed.id)}
                    className="space-y-3"
                    aria-label={`Edit ${feed.name}`}
                    aria-busy={editPending}
                    noValidate
                  >
                    <div>
                      <label htmlFor={`edit-feed-name-${feed.id}`} className="block text-sm font-medium mb-1">
                        Feed name
                      </label>
                      <input
                        ref={editNameRef}
                        id={`edit-feed-name-${feed.id}`}
                        name="edit-feed-name"
                        type="text"
                        required
                        readOnly={editPending}
                        placeholder="Example News"
                        value={editName}
                        onChange={handleEditNameChange}
                        aria-invalid={editErrors.name !== null}
                        aria-describedby={`edit-feed-name-error-${feed.id}`}
                        className="w-full px-3 py-2 rounded border text-base sm:text-sm"
                        style={{
                          backgroundColor: 'var(--background)',
                          borderColor: 'var(--control-border)',
                          color: 'var(--foreground)',
                        }}
                      />
                      <p id={`edit-feed-name-error-${feed.id}`} className="mt-1 text-sm" style={{ color: 'var(--status-error)' }}>
                        {editErrors.name}
                      </p>
                    </div>
                    <div>
                      <label htmlFor={`edit-feed-url-${feed.id}`} className="block text-sm font-medium mb-1">
                        Feed URL
                      </label>
                      <input
                        ref={editUrlRef}
                        id={`edit-feed-url-${feed.id}`}
                        name="edit-feed-url"
                        type="url"
                        inputMode="url"
                        required
                        readOnly={editPending}
                        placeholder="https://example.com/feed.xml"
                        value={editUrl}
                        onChange={handleEditUrlChange}
                        aria-invalid={editErrors.url !== null}
                        aria-describedby={`edit-feed-url-error-${feed.id}`}
                        className="w-full px-3 py-2 rounded border text-base sm:text-sm"
                        style={{
                          backgroundColor: 'var(--background)',
                          borderColor: 'var(--control-border)',
                          color: 'var(--foreground)',
                        }}
                      />
                      <p id={`edit-feed-url-error-${feed.id}`} className="mt-1 text-sm" style={{ color: 'var(--status-error)' }}>
                        {editErrors.url}
                      </p>
                    </div>
                    {operationFailure?.type === 'edit' && (
                      <p role="alert" className="text-sm" style={{ color: 'var(--status-error)' }}>
                        {operationFailure.message}
                      </p>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="submit"
                        disabled={anyPending}
                        className={`${getFeedManagerSubmitTone('save', true)} px-4 py-2 rounded text-sm font-medium button-hover-fade disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {editPending ? 'Save changes…' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={anyPending}
                        className="neutral-action px-4 py-2 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 w-full sm:w-auto">
                      <div className="flex flex-wrap items-start gap-2 mb-1">
                        <h4 className="min-w-0 max-w-full wrap-anywhere font-semibold">
                          {feed.name}
                        </h4>
                        <FeedLoadStatusIndicator
                          enabled={feed.enabled}
                          status={feedStatuses.find(
                            (item) => item.feedUrl === feed.url
                          )?.status}
                        />
                        {!feed.enabled && (
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: 'var(--code-bg)',
                              color: 'var(--foreground-subtle)',
                            }}
                          >
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="text-sm truncate" style={{ color: 'var(--foreground-muted)' }}>
                        {feed.url}
                      </p>
                    </div>
                    <FeedDeleteActions
                      feed={feed}
                      isConfirming={deletingId === feed.id}
                      onCancel={() => setDeletingId(null)}
                      onConfirm={() => handleConfirmDelete(feed.id)}
                      onDeleteRequest={() => beginDeleteConfirmation(feed.id)}
                      onEdit={() => handleEdit(feed)}
                      onToggle={() => handleToggle(feed.id)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
      <div role="status" className="sr-only">
        {statusMessage}
      </div>
    </dialog>
  );
}
