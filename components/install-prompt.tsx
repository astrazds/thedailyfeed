'use client';

import { useCallback, useEffect, useState } from 'react';
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

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();

      if (isStandaloneMode() || isDismissedRecently()) {
        return;
      }

      setDeferredPrompt(installEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleDismiss = useCallback(() => {
    setShowPrompt(false);
    localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      logger.info('User accepted the install prompt', {
        event: 'pwa_install_prompt_accepted',
      });
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  return (
    <>
      <div role="status" className="sr-only">
        {showPrompt ? 'The Daily Feed is available to install.' : ''}
      </div>
      {showPrompt && (
        <aside
          className="install-prompt fixed p-4 rounded-lg shadow-2xl z-50 animate-slide-up"
          style={{
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border-color)',
          }}
          aria-labelledby="install-prompt-title"
          aria-describedby="install-prompt-description"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-2xl" aria-hidden="true">
              📱
            </div>
            <div className="flex-1">
              <h2 id="install-prompt-title" className="font-semibold mb-1">
                Install The Daily Feed
              </h2>
              <p
                id="install-prompt-description"
                className="text-sm mb-3"
                style={{ color: 'var(--foreground-muted)' }}
              >
                Install this app for quick home-screen access.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleInstall}
                  className="primary-action px-4 py-2 rounded text-sm font-medium button-hover-fade"
                >
                  Install
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="neutral-action px-4 py-2 rounded text-sm font-medium button-hover-fade"
                >
                  Not now
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-shrink-0 text-xl leading-none min-w-10 min-h-10"
              style={{ color: 'var(--foreground-subtle)' }}
              aria-label="Close install prompt"
            >
              ×
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
