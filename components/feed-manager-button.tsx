'use client';

interface FeedManagerButtonProps {
  isOpen: boolean;
  onOpen: (trigger: HTMLButtonElement) => void;
}

export function FeedManagerButton({ isOpen, onOpen }: FeedManagerButtonProps) {

  return (
    <button
        type="button"
        onClick={(event) => onOpen(event.currentTarget)}
        className="feed-manager-trigger neutral-action fixed w-12 h-12 rounded-full shadow-lg flex items-center justify-center z-40 button-hover-fade"
        aria-label="Manage feeds"
        aria-controls="feed-manager-dialog"
        aria-expanded={isOpen}
        title="Manage feeds"
    >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v6m0 6v6m-6-6h6m6 0h-6" />
          <path d="M19.07 4.93l-4.24 4.24m0 5.66l4.24 4.24M4.93 4.93l4.24 4.24m0 5.66l-4.24 4.24" />
        </svg>
    </button>
  );
}
