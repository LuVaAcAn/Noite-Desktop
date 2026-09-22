import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, Paperclip, X } from 'lucide-react';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
import { StarRating } from '../../components/ui/StarRating';
import { useLibraryItem } from '../../hooks/use-library';
import { usePlanItemForLibraryItem } from '../../hooks/use-plan-item-for-library-item';
import { useReviewSummary } from '../../hooks/use-reviews';
import { useArchiveAttachment, useAttachments, useRestoreAttachment, useUploadAttachment } from '../../hooks/use-attachments';
import { useSpace } from '../../hooks/use-space';
import { useAuth } from '../../hooks/use-auth';
import { Modal, OverlayNotice } from '../../components/ui/Overlay';

export function ItemGalleryPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { space } = useSpace();
  const { actorId } = useAuth();
  const { data: item, isLoading } = useLibraryItem(itemId);
  const { planItem } = usePlanItemForLibraryItem(itemId);
  const { data: summary } = useReviewSummary(planItem?.id);
  const { data: attachments } = useAttachments(planItem?.id);
  const uploadAttachment = useUploadAttachment();
  const archiveAttachment = useArchiveAttachment();
  const restoreAttachment = useRestoreAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastArchived, setLastArchived] = useState<string | null>(null);

  const rating = summary?.reviews.find((review) => review.userId === actorId)?.rating ?? 0;
  useEffect(() => { if (!lastArchived) return; const timeout = window.setTimeout(() => setLastArchived(null), 6_000); return () => window.clearTimeout(timeout); }, [lastArchived]);

  function handleFiles(files: FileList | null) {
    if (!files || !space || !planItem) return;
    setError(null);
    Array.from(files).forEach((file) => {
      if (file.size > 3 * 1024 * 1024) {
        setError(`"${file.name}" supera los 3 MB permitidos`);
        return;
      }
      uploadAttachment.mutate({ spaceId: space.id, planItemId: planItem.id, file });
    });
  }

  if (isLoading) {
    return (
      <AppShell showBack><ScrollRegion label="Cargando galería" className="px-[var(--shell-gutter)] text-noche-muted">Cargando…</ScrollRegion></AppShell>
    );
  }
  if (!item) {
    return <AppShell showBack><ScrollRegion label="Actividad no encontrada" className="px-[var(--shell-gutter)] text-center"><h1 className="text-2xl font-bold text-noche-text">Actividad no encontrada</h1><button className="mt-4 rounded-[11px] bg-noche-text px-4 py-2 text-white" onClick={() => navigate('/')}>Volver al inicio</button></ScrollRegion></AppShell>;
  }

  return (
    <AppShell showBack>
      <ScrollRegion label={`Galería: ${item.title}`} className="app-route-content px-[var(--shell-gutter)] pb-5">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-noche-text">{item.title}</h1>
            <div className="mt-2">
              <StarRating value={rating} readOnly />
            </div>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              disabled={!planItem}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-pill bg-noche-text px-4 py-2.5 text-sm font-semibold text-noche-bg hover:brightness-90 disabled:opacity-40"
            >
              <Paperclip size={15} /> Adjuntar imágenes (max 3 MB)
            </button>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {!planItem && (
          <p className="mb-6 text-sm text-noche-muted">
            Registra esta actividad desde{' '}
            <button className="underline hover:text-noche-text" onClick={() => navigate('/actividades/nueva')}>
              Nueva actividad
            </button>{' '}
            antes de subir capturas.
          </p>
        )}

        {attachments && attachments.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group relative aspect-video overflow-hidden rounded-xl border border-noche-border bg-noche-surface"
              >
                <button type="button" aria-label={`Ampliar captura de ${item.title}`} onClick={() => setLightbox(attachment.resolvedUrl ?? null)} className="h-full w-full">
                  <img src={attachment.resolvedUrl} alt={attachment.altText ?? item.title} className="h-full w-full object-cover" />
                </button>
                <button
                  aria-label="Archivar captura"
                  onClick={async () => { await archiveAttachment.mutateAsync(attachment.id); setLastArchived(attachment.id); }}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                >
                  <Archive size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          planItem && (
            <p className="rounded-2xl border border-dashed border-noche-border py-16 text-center text-sm text-noche-muted">
              Todavía no han subido capturas de este momento.
            </p>
          )
        )}
      </ScrollRegion>

      {lightbox && (
        <Modal ariaLabel="Vista ampliada de la captura" className="flex items-center justify-center bg-black/90 p-8" closeOnBackdrop onClose={() => setLightbox(null)}>
          <button
            aria-label="Cerrar"
            onClick={() => setLightbox(null)}
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={18} />
          </button>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        </Modal>
      )}
      {lastArchived && <OverlayNotice role="status" className="bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-sm bg-neutral-950 px-4 py-3 text-sm text-white shadow-2xl"><span>Captura archivada.</span><button className="font-semibold text-emerald-300" onClick={async () => { await restoreAttachment.mutateAsync(lastArchived); setLastArchived(null); }}>Deshacer</button></OverlayNotice>}
    </AppShell>
  );
}
