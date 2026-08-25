import { useRef } from 'react';
import type { Feed } from '@/lib/feed-storage';

interface FeedDeleteActionsProps {
  feed: Feed;
  isConfirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onDeleteRequest: () => void;
  onEdit: () => void;
  onToggle: () => void;
}

type FocusTarget = Pick<HTMLButtonElement, 'focus'>;
type FocusScheduler = (callback: () => void) => void;

export function focusDeleteCancelAction(element: FocusTarget | null): void {
  element?.focus();
}

export function focusAfterUpdate(
  getTarget: () => FocusTarget | null,
  schedule: FocusScheduler = (callback) => requestAnimationFrame(callback)
): void {
  schedule(() => getTarget()?.focus());
}

export function focusPendingTarget(
  pending: { current: boolean },
  target: FocusTarget | null
): void {
  if (!pending.current || !target) {
    return;
  }

  pending.current = false;
  target.focus();
}

export function FeedDeleteActions({
  feed,
  isConfirming,
  onCancel,
  onConfirm,
  onDeleteRequest,
  onEdit,
  onToggle,
}: FeedDeleteActionsProps) {
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  if (isConfirming) {
    return (
      <div
        className="flex gap-2 flex-wrap flex-shrink-0"
        role="group"
        aria-label={`Confirm deletion of ${feed.name}`}
      >
        <button
          type="button"
          ref={focusDeleteCancelAction}
          onClick={() => {
            onCancel();
            focusAfterUpdate(() => deleteButtonRef.current);
          }}
          className="neutral-action px-3 py-2 rounded text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          aria-label={`Delete “${feed.name}”`}
          className="destructive-button px-3 py-2 rounded text-sm"
        >
          Delete feed
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2 flex-wrap flex-shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className="neutral-action px-3 py-2 rounded text-sm button-hover-fade"
      >
        {feed.enabled ? 'Disable' : 'Enable'}
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="neutral-action px-3 py-2 rounded text-sm"
      >
        Edit
      </button>
      <button
        ref={deleteButtonRef}
        type="button"
        onClick={onDeleteRequest}
        className="danger-text-action px-3 py-2 rounded text-sm"
      >
        Delete
      </button>
    </div>
  );
}
