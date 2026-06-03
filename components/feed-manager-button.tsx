'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const FeedManagerModal = dynamic(
  () => import('./feed-manager-modal').then((mod) => mod.FeedManagerModal),
  { ssr: false }
);

export function FeedManagerButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-6 right-6 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-40"
        style={{
          backgroundColor: 'var(--accent-primary)',
          color: 'var(--background)',
        }}
        aria-label="Manage Feeds"
        title="Manage Feeds"
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
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v6m0 6v6m-6-6h6m6 0h-6" />
          <path d="M19.07 4.93l-4.24 4.24m0 5.66l4.24 4.24M4.93 4.93l4.24 4.24m0 5.66l-4.24 4.24" />
        </svg>
      </button>

      <FeedManagerModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
