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

export function focusDeleteCancelAction(element: FocusTarget | null): void {
  element?.focus();
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
  if (isConfirming) {
    return (
      <div
        className="flex gap-2 flex-shrink-0"
        role="group"
        aria-label={`Confirm deletion of ${feed.name}`}
      >
        <button
          ref={focusDeleteCancelAction}
          onClick={onCancel}
          className="px-3 py-1 rounded text-sm"
          style={{
            backgroundColor: 'var(--code-bg)',
            color: 'var(--foreground)',
          }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          aria-label={`Delete “${feed.name}”`}
          className="destructive-button px-3 py-1 rounded text-sm"
        >
          Delete feed
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2 flex-shrink-0">
      <button
        onClick={onToggle}
        className="px-3 py-1 rounded text-sm transition-colors button-hover-fade"
        style={{
          backgroundColor: feed.enabled ? 'var(--code-bg)' : 'var(--accent-primary)',
          color: feed.enabled ? 'var(--foreground)' : 'var(--background)',
        }}
      >
        {feed.enabled ? 'Disable' : 'Enable'}
      </button>
      <button
        onClick={onEdit}
        className="px-3 py-1 rounded text-sm"
        style={{
          backgroundColor: 'var(--code-bg)',
          color: 'var(--foreground)',
        }}
      >
        Edit
      </button>
      <button
        onClick={onDeleteRequest}
        className="px-3 py-1 rounded text-sm"
        style={{
          backgroundColor: 'var(--code-bg)',
          color: 'var(--accent-primary)',
        }}
      >
        Delete
      </button>
    </div>
  );
}
