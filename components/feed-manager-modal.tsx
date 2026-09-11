'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Feed } from '@/lib/feed-storage';
import type { FeedSetLifecycleStatusItem } from '@/lib/feed-set-lifecycle';
import { focusAfterUpdate, focusPendingTarget } from './feed-delete-actions';
import { FeedManagerForm } from './feed-manager-form';
import { FeedManagerList } from './feed-manager-list';
import { FeedManagerTransfer } from './feed-manager-transfer';
import { useFeedManagerActions } from './use-feed-manager-actions';

interface FeedManagerModalProps {
  feeds: Feed[];
  feedStatuses?: FeedSetLifecycleStatusItem[];
  isOpen: boolean;
  isRefreshing: boolean;
  onRefreshFeeds: () => Promise<void>;
  onFeedsChange: (feeds: Feed[]) => void;
  onClose: () => void;
}

export function FeedManagerModal({
  feeds, feedStatuses = [], isOpen, isRefreshing, onRefreshFeeds, onFeedsChange, onClose,
}: FeedManagerModalProps) {
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const feedListHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingFeedListFocusRef = useRef(false);
  const actions = useFeedManagerActions({
    isRefreshing,
    onRefreshFeeds,
    onFeedsChange,
    beforeListChange: () => { pendingFeedListFocusRef.current = true; },
  });

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

  const handleClose = () => dialogRef.current?.close();
  const cancelEdit = () => {
    setEditingFeed(null);
    actions.clearFailure('edit');
    focusAfterUpdate(() => feedListHeadingRef.current);
  };

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
          <FeedManagerForm
            mode={{ type: 'add', isEditing: editingFeed !== null }}
            pending={actions.pending?.type === 'add'}
            disabled={actions.pending !== null}
            failure={actions.failure?.type === 'add' ? actions.failure.message : null}
            onChange={() => actions.clearFailure('add')}
            onSubmit={draft => actions.save({ type: 'add', ...draft })}
          />
        </details>
        <FeedManagerTransfer feeds={feeds} actions={actions} />
        <FeedManagerList
          feeds={feeds}
          feedStatuses={feedStatuses}
          editingFeed={editingFeed}
          onEdit={setEditingFeed}
          onCancelEdit={cancelEdit}
          actions={actions}
          feedListHeadingRef={feedListHeadingRef}
          isRefreshing={isRefreshing}
        />
      </div>
      <div role="status" className="sr-only">
        {actions.statusMessage}
      </div>
    </dialog>
  );
}
