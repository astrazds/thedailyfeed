import { useState, type RefObject } from 'react';
import type { Feed } from '@/lib/feed-storage';
import type { FeedSetLifecycleStatusItem } from '@/lib/feed-set-lifecycle';
import { FeedManagerForm } from './feed-manager-form';
import { FeedDeleteActions, focusAfterUpdate } from './feed-delete-actions';
import type { FeedManagerActions } from './use-feed-manager-actions';

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

export function FeedManagerList({
  feeds, feedStatuses, editingFeed, onEdit, onCancelEdit, actions, feedListHeadingRef, isRefreshing,
}: {
  feeds: Feed[];
  feedStatuses: FeedSetLifecycleStatusItem[];
  editingFeed: Feed | null;
  onEdit: (feed: Feed | null) => void;
  onCancelEdit: () => void;
  actions: FeedManagerActions;
  feedListHeadingRef: RefObject<HTMLHeadingElement | null>;
  isRefreshing: boolean;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const refreshBusy = actions.refreshPending || isRefreshing;
  const showFeedRecovery = actions.refreshPending || feedStatuses.some(item => item.status === 'error' || item.status === 'timeout');
  const beginEdit = (feed: Feed) => {
    actions.clearFailure('edit');
    onEdit(feed);
  };
  const confirmDelete = async (id: string) => {
    if (await actions.mutate('delete', id)) setDeletingId(null);
  };
  const refresh = async () => {
    await actions.refresh();
    focusAfterUpdate(() => feedListHeadingRef.current);
  };
  return (
    <section aria-labelledby="feed-list-title" className="mt-6">
      <h3
        ref={feedListHeadingRef}
        id="feed-list-title"
        tabIndex={-1}
        className="text-lg font-semibold mb-3"
      >
        Feeds ({feeds.length})
      </h3>
      {(actions.failure?.type === 'toggle' || actions.failure?.type === 'delete') && (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--status-error)' }}>
          {actions.failure.message}
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
            onClick={refresh}
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
            {editingFeed?.id === feed.id ? (
              <FeedManagerForm
                key={feed.id}
                mode={{ type: 'edit', feed, onCancel: onCancelEdit }}
                pending={actions.pending?.type === 'edit' && actions.pending.feedId === feed.id}
                disabled={actions.pending !== null}
                failure={actions.failure?.type === 'edit' ? actions.failure.message : null}
                onChange={() => actions.clearFailure('edit')}
                onSubmit={async draft => {
                  const saved = await actions.save({ type: 'edit', id: feed.id, ...draft });
                  if (saved) onEdit(null);
                  return saved;
                }}
              />
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
                  onConfirm={() => confirmDelete(feed.id)}
                  onDeleteRequest={() => setDeletingId(feed.id)}
                  onEdit={() => beginEdit(feed)}
                  onToggle={() => actions.mutate('toggle', feed.id)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
