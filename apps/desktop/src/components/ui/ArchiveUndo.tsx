import { useEffect } from 'react';
import { OverlayNotice } from './Overlay';

export function ArchiveUndo({ title, onUndo, onDismiss }: { title: string; onUndo: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 8_000);
    return () => window.clearTimeout(timeout);
  }, [onDismiss]);
  return (
    <OverlayNotice role="status" className="bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-full border border-noche-border bg-noche-surface px-5 py-3 text-sm text-noche-text shadow-2xl">
      <span>“{title}” se archivó.</span>
      <button className="font-semibold text-[rgb(var(--theme-accent))] underline" onClick={onUndo}>Deshacer</button>
    </OverlayNotice>
  );
}
