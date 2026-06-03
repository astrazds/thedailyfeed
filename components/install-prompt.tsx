'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { logger } from '@/lib/logger';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_STORAGE_KEY = 'pwa-install-dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

function isDismissedRecently(): boolean {
  if (typeof window === 'undefined') return false;

  const dismissed = localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!dismissed) return false;

  const dismissedTime = parseInt(dismissed, 10);
  if (Number.isNaN(dismissedTime)) return false;

  return Date.now() - dismissedTime < DISMISS_DURATION_MS;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )
  );
}

/**
 * PWA install prompt component
 * Shows a prompt to install the app when available
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const installButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const installEvent = e as BeforeInstallPromptEvent;

      // Prevent the mini-infobar from appearing on mobile
      installEvent.preventDefault();

      if (isStandaloneMode() || isDismissedRecently()) {
        return;
      }

      // Save the event so it can be triggered later
      setDeferredPrompt(installEvent);
      // Show install prompt
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setShowPrompt(false);
    // Remember dismissal for 7 days
    localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      logger.info('User accepted the install prompt', {
        event: 'pwa_install_prompt_accepted',
      });
    }

    // Clear the deferredPrompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  useEffect(() => {
    if (showPrompt) {
      installButtonRef.current?.focus();
    }
  }, [showPrompt]);

  const handleDialogKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleDismiss();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements(event.currentTarget);
    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }, [handleDismiss]);

  if (!showPrompt) return null;

  return (
    <div 
      className="fixed bottom-4 right-4 max-w-sm p-4 rounded-lg shadow-2xl z-50 animate-slide-up"
      style={{ 
        backgroundColor: 'var(--background)',
        border: '1px solid var(--border-color)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-prompt-title"
      aria-describedby="install-prompt-description"
      onKeyDown={handleDialogKeyDown}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-2xl">
          📱
        </div>
        <div className="flex-1">
          <h3 
            id="install-prompt-title"
            className="font-semibold mb-1" 
            style={{ color: 'var(--foreground)' }}
          >
            Install The Daily Feed
          </h3>
          <p id="install-prompt-description" className="text-sm mb-3" style={{ color: 'var(--foreground-muted)' }}>
            Install this app for quick home-screen access.
          </p>
          <div className="flex gap-2">
            <button
              ref={installButtonRef}
              onClick={handleInstall}
              className="px-4 py-2 rounded text-sm font-medium transition-colors button-hover-fade"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background)',
              }}
            >
              Install
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 rounded text-sm font-medium transition-colors button-hover-fade"
              style={{
                backgroundColor: 'var(--code-bg)',
                color: 'var(--foreground)',
              }}
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-xl leading-none"
          style={{ color: 'var(--foreground-subtle)' }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}
