import { useEffect, useRef, type ReactNode } from 'react';
import type { ReaderPalette } from '../contracts';

export function ManagerModal({ isOpen, onClose, palette, children }: {
  isOpen: boolean;
  onClose: () => void;
  palette: ReaderPalette;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[aria-label="Close feed manager"]')?.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);
  return <dialog
    ref={ref}
    id="feed-manager-dialog"
    aria-labelledby="feed-manager-title"
    onClose={() => { opener.current?.focus(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}
    style={{
      width: 'min(42rem, calc(100vw - 2rem - env(safe-area-inset-left) - env(safe-area-inset-right)))',
      height: 'calc(100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      maxHeight: 'calc(100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      margin: 'auto', padding: 0, border: 0, borderRadius: 8,
      overscrollBehavior: 'contain', backgroundColor: palette.background, color: palette.foreground,
      boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    }}
  >
    <style>{'#feed-manager-dialog[open]{display:flex;flex-direction:column}#feed-manager-dialog::backdrop{background:rgb(0 0 0 / .5)}'}</style>
    {children}
  </dialog>;
}
