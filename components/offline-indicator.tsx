'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Offline indicator component
 * Shows a banner when user is offline
 */
export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [showIndicator, setShowIndicator] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearHideTimeout = () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      setShowIndicator(true);

      // Hide "back online" message after 3 seconds
      clearHideTimeout();
      hideTimeoutRef.current = setTimeout(() => {
        setShowIndicator(false);
        hideTimeoutRef.current = null;
      }, 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowIndicator(true);
      clearHideTimeout();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearHideTimeout();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!showIndicator) return null;

  return (
    <div 
      className="fixed bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 transition-all animate-slide-up"
      style={{ 
        backgroundColor: isOnline ? 'var(--accent-primary)' : 'var(--code-bg)',
        color: isOnline ? 'var(--background)' : 'var(--foreground)',
        border: isOnline ? 'none' : '1px solid var(--border-color)',
      }}
      role="alert"
      aria-live="polite"
    >
      {isOnline ? (
        <>
          <span className="mr-2">✓</span>
          Back online
        </>
      ) : (
        <>
          <span className="mr-2">📡</span>
          You are offline. New feed updates are unavailable.
        </>
      )}
    </div>
  );
}
