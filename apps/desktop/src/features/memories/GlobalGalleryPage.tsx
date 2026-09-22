import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Camera, ChevronLeft, ChevronRight, ImagePlus, RotateCcw, X } from 'lucide-react';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAllAttachments, useArchiveAttachment, useRestoreAttachment, useUploadAttachment } from '../../hooks/use-attachments';
import { useSpace } from '../../hooks/use-space';
import { planRepository } from '../../lib/repositories';
import type { Attachment } from '@proyecto-noche/domain';
import { Modal, OverlayNotice } from '../../components/ui/Overlay';

type GalleryItem = {
  attachment: Attachment;
  planItemId: string;
  title: string;
  completedAt: string | null;
};

export function GlobalGalleryPage() {
  const { space, members } = useSpace();
  const attachments = useAllAttachments(space?.id);
  const plans = useQuery({
    queryKey: ['plans', space?.id],
    queryFn: () => planRepository.list(space!.id),
    enabled: !!space,
  });
  const [actor, setActor] = useState('all');
  const [activity, setActivity] = useState('all');
  const [date, setDate] = useState('all');
  const [targetPlanItemId, setTargetPlanItemId] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const upload = useUploadAttachment();
  const archive = useArchiveAttachment();
  const restore = useRestoreAttachment();

  const completedItems = useMemo(() => (plans.data ?? []).flatMap((plan) =>
    plan.items.filter((item) => item.completedAt || item.status === 'completed').map((item) => ({
      id: item.id,
      title: item.titleSnapshot,
      completedAt: item.completedAt ?? plan.completedAt,
    }))), [plans.data]);

  const allItems = useMemo<GalleryItem[]>(() => {
    const byId = new Map(completedItems.map((item) => [item.id, item]));
    return (attachments.data ?? []).flatMap((attachment) => {
      if (!attachment.planItemId) return [];
      const item = byId.get(attachment.planItemId);
      return [{ attachment, planItemId: attachment.planItemId, title: item?.title ?? 'Memoria', completedAt: item?.completedAt ?? attachment.createdAt }];
    });
  }, [attachments.data, completedItems]);

  const filtered = useMemo(() => allItems.filter((item) => {
    if (actor !== 'all' && item.attachment.uploadedBy !== actor) return false;
    if (activity !== 'all' && item.planItemId !== activity) return false;
    if (date !== 'all' && (item.completedAt ?? item.attachment.createdAt).slice(0, 7) !== date) return false;
    return true;
  }), [activity, actor, allItems, date]);

  const monthOptions = useMemo(() => [...new Set(allItems.map((item) => (item.completedAt ?? item.attachment.createdAt).slice(0, 7)))].sort().reverse(), [allItems]);
  const lightbox = lightboxIndex === null ? null : filtered[lightboxIndex];
  const groups = useMemo(() => [...new Map(filtered.map((item) => [item.planItemId, { id: item.planItemId, title: item.title, items: filtered.filter((candidate) => candidate.planItemId === item.planItemId) }])).values()], [filtered]);

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') setLightboxIndex((current) => current === null ? null : (current - 1 + filtered.length) % filtered.length);
      if (event.key === 'ArrowRight') setLightboxIndex((current) => current === null ? null : (current + 1) % filtered.length);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filtered.length, lightbox]);

  useEffect(() => {
    if (!undoId) return;
    const timeout = window.setTimeout(() => setUndoId(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [undoId]);

  async function handleFiles(files: FileList | null) {
    if (!files || !space || !targetPlanItemId) return;
    for (const file of Array.from(files)) {
      if (file.size > 3 * 1024 * 1024) {
        window.dispatchEvent(new CustomEvent('app-error', { detail: `${file.name} supera los 3 MB.` }));
        continue;
      }
      await upload.mutateAsync({ spaceId: space.id, planItemId: targetPlanItemId, file });
    }
    if (fileRef.current) fileRef.current.value = '';
    window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Capturas añadidas a la galería.' }));
  }

  return (
    <AppShell showBack activeSection="home">
      <div className="relative z-0 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden px-[var(--shell-gutter)]">
        <header className="flex min-w-0 flex-col gap-3 border-b border-noche-border py-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="shrink-0">
            <p className="font-title text-xs font-bold uppercase tracking-[0.24em] text-[rgb(var(--theme-accent))]">Noite</p>
            <h1 className="font-display text-2xl font-semibold text-noche-text">Galería de memorias</h1>
          </div>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <Filter label="Persona" value={actor} onChange={setActor} options={[
              { value: 'all', label: 'Todos' },
              ...members.map((member) => ({ value: member.userId, label: member.displayName ?? (member.userId === 'me' ? 'Tú' : 'Pareja') })),
            ]} />
            <Filter label="Actividad" value={activity} onChange={setActivity} options={[
              { value: 'all', label: 'Todas' },
              ...completedItems.map((item) => ({ value: item.id, label: item.title })),
            ]} />
            <Filter label="Fecha" value={date} onChange={setDate} options={[
              { value: 'all', label: 'Cualquier fecha' },
              ...monthOptions.map((month) => ({ value: month, label: new Date(`${month}-02`).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }) })),
            ]} />
            <label className="text-xs font-semibold text-noche-muted">
              Subir a
              <select value={targetPlanItemId} onChange={(event) => setTargetPlanItemId(event.target.value)} className="mt-1 block max-w-44 rounded-sm border border-noche-border bg-noche-surface px-3 py-2 text-sm text-noche-text">
                <option value="">Elige una memoria</option>
                {completedItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
            <input ref={fileRef} className="hidden" type="file" accept="image/*" multiple onChange={(event) => handleFiles(event.target.files)} />
            <Button size="sm" disabled={!targetPlanItemId || upload.isPending} onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> {upload.isPending ? 'Subiendo…' : 'Añadir'}</Button>
          </div>
        </header>

        <ScrollRegion label="Capturas de todas las memorias" className="pt-4 pr-1 pb-[var(--floating-controls-clearance)]">
          {attachments.isLoading || plans.isLoading ? <p className="text-sm text-noche-muted">Cargando galería…</p> : filtered.length === 0 ? (
            <EmptyState icon={Camera} title="Aún no hay capturas aquí" description={allItems.length ? 'Prueba quitando alguno de los filtros.' : 'Completa una actividad y guarda aquí las fotos de ese momento.'} />
          ) : (
            <div className="space-y-5">{groups.map((group) => <section key={group.id} aria-labelledby={`gallery-${group.id}`}><h2 id={`gallery-${group.id}`} className="mb-2 py-1 text-sm font-semibold text-noche-text">{group.title} <span className="font-normal text-noche-muted">· {group.items.length}</span></h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {group.items.map((item) => { const index = filtered.findIndex((candidate) => candidate.attachment.id === item.attachment.id); return (
                <article key={item.attachment.id} className="group relative overflow-hidden rounded-sm border border-noche-border bg-noche-surface">
                  <button className="block aspect-[4/3] w-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--theme-accent))]" onClick={() => setLightboxIndex(index)} aria-label={`Abrir ${item.title}`}>
                    <img src={item.attachment.resolvedUrl} alt={item.attachment.altText ?? item.title} className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]" />
                  </button>
                  <div className="flex items-center justify-between gap-2 p-2.5">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-noche-text">{item.title}</p><p className="text-[11px] text-noche-muted">{new Date(item.completedAt ?? item.attachment.createdAt).toLocaleDateString('es-PE')}</p></div>
                    <button className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-noche-muted hover:bg-noche-surface-hover hover:text-noche-text" aria-label={`Archivar captura de ${item.title}`} onClick={async () => { await archive.mutateAsync(item.attachment.id); setUndoId(item.attachment.id); window.dispatchEvent(new CustomEvent('app-sound', { detail: 'archive' })); }}><Archive size={15} /></button>
                  </div>
                </article>
              ); })}
            </div></section>)}</div>
          )}
        </ScrollRegion>
      </div>

      {undoId && <OverlayNotice role="status" className="bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-sm bg-neutral-950 px-4 py-3 text-sm text-white shadow-2xl"><span>Captura archivada.</span><button className="inline-flex items-center gap-1 font-semibold text-emerald-300" onClick={async () => { await restore.mutateAsync(undoId); setUndoId(null); }}><RotateCcw size={14} /> Deshacer</button></OverlayNotice>}

      {lightbox && <Modal ariaLabel={`Captura de ${lightbox.title}`} initialFocusRef={closeRef} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center bg-black/95 p-4" closeOnBackdrop onClose={() => setLightboxIndex(null)}>
        <button className="grid h-12 w-12 place-items-center rounded-full text-white hover:bg-white/10" aria-label="Captura anterior" onClick={() => setLightboxIndex((lightboxIndex! - 1 + filtered.length) % filtered.length)}><ChevronLeft /></button>
        <figure className="min-h-0 text-center"><img src={lightbox.attachment.resolvedUrl} alt={lightbox.attachment.altText ?? lightbox.title} className="mx-auto max-h-[78dvh] max-w-full rounded-sm object-contain" /><figcaption className="mt-3 text-sm text-white/80">{lightbox.title} · {new Date(lightbox.completedAt ?? lightbox.attachment.createdAt).toLocaleDateString('es-PE')}</figcaption></figure>
        <button className="grid h-12 w-12 place-items-center rounded-full text-white hover:bg-white/10" aria-label="Captura siguiente" onClick={() => setLightboxIndex((lightboxIndex! + 1) % filtered.length)}><ChevronRight /></button>
        <button ref={closeRef} className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Cerrar galería" onClick={() => setLightboxIndex(null)}><X /></button>
      </Modal>}
    </AppShell>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="text-xs font-semibold text-noche-muted">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block max-w-36 rounded-sm border border-noche-border bg-noche-surface px-3 py-2 text-sm text-noche-text">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
