import { useState } from 'react';
import { ArchiveRestore, Image, Library, RotateCcw, Trash2 } from 'lucide-react';
import type { PurgePreview } from '@proyecto-noche/domain';
import { useAllAttachments, useRestoreAttachment } from '../../hooks/use-attachments';
import { useLibraryList, useRestoreLibraryItem } from '../../hooks/use-library';
import { useSpace } from '../../hooks/use-space';
import { Button } from '../../components/ui/Button';
import { previewActivityPurge, previewArchivePurge, previewAttachmentPurge, purgeAllArchived, purgeArchivedActivity, purgeArchivedAttachment } from '../../lib/native-data-management';
import { Modal } from '../../components/ui/Overlay';

type PendingPurge = { kind: 'activity' | 'attachment' | 'all'; id?: string; preview: PurgePreview };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ArchiveSettingsPanel() {
  const { space } = useSpace();
  const items = useLibraryList({ onlyArchived: true, pageSize: 500 });
  const attachments = useAllAttachments(space?.id, true);
  const restoreItem = useRestoreLibraryItem();
  const restoreAttachment = useRestoreAttachment();
  const archivedAttachments = attachments.data?.filter((attachment) => attachment.archivedAt) ?? [];
  const [pending, setPending] = useState<PendingPurge | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function openPurge(kind: PendingPurge['kind'], id?: string) {
    setError(null);
    try {
      const preview = kind === 'activity' ? await previewActivityPurge(id!) : kind === 'attachment' ? await previewAttachmentPurge(id!) : await previewArchivePurge();
      setConfirmation(''); setPending({ kind, id, preview });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo preparar la eliminación.'); }
  }

  async function confirmPurge() {
    if (!pending) return;
    setWorking(true); setError(null);
    try {
      if (pending.kind === 'activity') await purgeArchivedActivity(pending.id!, confirmation);
      else if (pending.kind === 'attachment') await purgeArchivedAttachment(pending.id!, confirmation);
      else await purgeAllArchived(confirmation);
      window.location.reload();
    } catch (cause) { setError(typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : 'No se pudo completar la eliminación.'); setWorking(false); }
  }

  const hasArchived = Boolean(items.data?.items.length || archivedAttachments.length);
  return <section className="rounded-sm border border-noche-border bg-noche-surface p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold text-noche-text"><ArchiveRestore size={19} /> Archivo</h2><p className="mt-1 text-sm text-noche-muted">Restaura elementos o elimínalos definitivamente junto con su historial local.</p></div>{hasArchived && <Button size="sm" variant="ghost" onClick={() => void openPurge('all')}><Trash2 size={14} /> Vaciar archivo</Button>}</div>
    {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <div><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-noche-text"><Library size={16} /> Actividades</h3><div className="space-y-2">{items.data?.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-sm bg-noche-bg p-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-noche-text">{item.title}</p><p className="text-xs text-noche-muted">Archivada {item.archivedAt ? new Date(item.archivedAt).toLocaleDateString('es-PE') : ''}</p></div><div className="flex shrink-0 gap-1"><Button size="sm" variant="ghost" onClick={() => restoreItem.mutate(item.id)}><RotateCcw size={14} /> Restaurar</Button><button aria-label={`Eliminar definitivamente ${item.title}`} onClick={() => void openPurge('activity', item.id)} className="rounded-full p-2 text-noche-muted hover:bg-red-500/10 hover:text-red-500"><Trash2 size={15} /></button></div></div>)}{!items.isLoading && items.data?.items.length === 0 && <p className="rounded-sm border border-dashed border-noche-border p-5 text-center text-sm text-noche-muted">No hay actividades archivadas.</p>}</div></div>
      <div><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-noche-text"><Image size={16} /> Capturas</h3><div className="grid grid-cols-2 gap-2">{archivedAttachments.map((attachment) => <div key={attachment.id} className="relative aspect-video overflow-hidden rounded-sm border border-noche-border"><img src={attachment.resolvedUrl} alt={attachment.altText ?? 'Captura archivada'} className="h-full w-full object-cover opacity-65" /><div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/25"><button aria-label="Restaurar captura" className="rounded-full bg-black/50 p-2 text-white hover:bg-black/70" onClick={() => restoreAttachment.mutate(attachment.id)}><RotateCcw size={17} /></button><button aria-label="Eliminar captura definitivamente" className="rounded-full bg-black/50 p-2 text-white hover:bg-red-700" onClick={() => void openPurge('attachment', attachment.id)}><Trash2 size={17} /></button></div></div>)}{!attachments.isLoading && archivedAttachments.length === 0 && <p className="col-span-2 rounded-sm border border-dashed border-noche-border p-5 text-center text-sm text-noche-muted">No hay capturas archivadas.</p>}</div></div>
    </div>
    {pending && <Modal labelledBy="purge-title" className="grid place-items-center overflow-y-auto bg-black/65 p-4" onClose={() => { setPending(null); setError(null); }}><div className="w-full max-w-lg rounded-2xl bg-noche-surface p-6 shadow-2xl"><h2 id="purge-title" className="text-lg font-semibold text-noche-text">Eliminar definitivamente: {pending.preview.targetTitle}</h2><p className="mt-2 text-sm leading-6 text-noche-muted">Se eliminarán {pending.preview.counts.libraryItems} actividades, {pending.preview.counts.planItems} ocurrencias, {pending.preview.counts.reviews + pending.preview.counts.sharedReviews} opiniones, {pending.preview.counts.attachments} capturas y {pending.preview.counts.musicAssociations} asociaciones musicales. Se liberarán hasta {formatBytes(pending.preview.mediaBytes)}.</p><p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700">Los respaldos automáticos anteriores se reemplazarán para que este contenido no pueda restaurarse. Los archivos .noche que hayas exportado fuera de la aplicación no pueden eliminarse desde aquí.</p><label className="mt-4 block text-sm text-noche-muted">Escribe <strong>ELIMINAR</strong><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-3 py-2 text-noche-text" /></label><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => { setPending(null); setError(null); }}>Cancelar</Button><Button disabled={confirmation !== 'ELIMINAR' || working} onClick={() => void confirmPurge()}>{working ? 'Eliminando…' : 'Eliminar definitivamente'}</Button></div></div></Modal>}
  </section>;
}
