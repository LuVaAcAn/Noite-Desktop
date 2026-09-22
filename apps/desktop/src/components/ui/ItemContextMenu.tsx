import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, CheckCircle2, Copy, Gamepad2, Image as ImageIcon, Pencil, RefreshCcw, Star } from 'lucide-react';
import type { LibraryItemStatus } from '@proyecto-noche/domain';
import { Button } from './Button';
import { Modal, OverlayPortal } from './Overlay';

interface ItemContextMenuProps {
  x: number;
  y: number;
  itemTitle: string;
  isFavorite: boolean;
  status: LibraryItemStatus;
  onClose: () => void;
  onToggleFavorite: () => void;
  onReset: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onCopyName: () => void;
  onChangeCover: () => void;
  onPlay?: () => void;
}

export function ItemContextMenu(props: ItemContextMenuProps) {
  const { onClose } = props;
  const [dialog, setDialog] = useState<'rename' | 'archive' | null>(null);
  const [title, setTitle] = useState(props.itemTitle);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useMemo(() => ({
    left: Math.max(8, Math.min(props.x, window.innerWidth - 264)),
    top: Math.max(8, Math.min(props.y, window.innerHeight - 310)),
  }), [props.x, props.y]);

  useEffect(() => {
    if (!dialog) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!dialog) onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog, onClose]);

  function run(action: () => void) {
    action();
    props.onClose();
  }

  return (
    <OverlayPortal>
    <>
      {!dialog && <>
      <button aria-label="Cerrar menú" className="fixed inset-0 z-40 cursor-default" onClick={props.onClose} onContextMenu={(event) => event.preventDefault()} />
      <div ref={menuRef} role="menu" aria-label={`Acciones para ${props.itemTitle}`} style={position} className="fixed z-50 w-64 overflow-hidden rounded-xl border border-noche-border bg-noche-surface p-1 shadow-2xl">
        {props.onPlay && <button role="menuitem" onClick={() => run(props.onPlay!)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-[rgb(var(--theme-accent))] hover:bg-noche-surface-hover"><Gamepad2 size={15} />Jugar</button>}
        <button role="menuitem" onClick={() => run(props.onToggleFavorite)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-noche-text hover:bg-noche-surface-hover"><Star size={15} />{props.isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}</button>
        {props.status === 'completed'
          ? <button role="menuitem" onClick={() => run(props.onReset)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-noche-text hover:bg-noche-surface-hover"><RefreshCcw size={15} />Marcar como pendiente</button>
          : <button role="menuitem" onClick={() => run(props.onComplete)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-noche-text hover:bg-noche-surface-hover"><CheckCircle2 size={15} />Marcar como realizada</button>}
        <button role="menuitem" onClick={() => setDialog('rename')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-noche-text hover:bg-noche-surface-hover"><Pencil size={15} />Renombrar</button>
        <button role="menuitem" onClick={() => run(props.onCopyName)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-noche-text hover:bg-noche-surface-hover"><Copy size={15} />Copiar nombre</button>
        <button role="menuitem" onClick={() => run(props.onChangeCover)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-noche-text hover:bg-noche-surface-hover"><ImageIcon size={15} />Cambiar portada</button>
        <button role="menuitem" onClick={() => setDialog('archive')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-amber-700 hover:bg-amber-50"><Archive size={15} />Archivar actividad</button>
      </div>
      </>}

      {dialog && (
        <Modal labelledBy="item-action-title" className="flex items-center justify-center bg-black/60 p-4" onClose={() => setDialog(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-noche-surface p-6 shadow-2xl">
            <h2 id="item-action-title" className="font-semibold text-noche-text">{dialog === 'rename' ? 'Renombrar actividad' : 'Archivar actividad'}</h2>
            {dialog === 'rename' ? (
              <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className="mt-4 w-full rounded-xl border border-noche-border bg-noche-bg px-4 py-3 text-noche-text" />
            ) : (
              <p className="mt-2 text-sm text-noche-muted">Se ocultará de la biblioteca, pero sus planes, reseñas y recuerdos se conservarán.</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>Cancelar</Button>
              <Button size="sm" disabled={dialog === 'rename' && !title.trim()} onClick={() => run(() => dialog === 'rename' ? props.onRename(title.trim()) : props.onDelete())}>{dialog === 'rename' ? 'Guardar' : 'Archivar'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
    </OverlayPortal>
  );
}
