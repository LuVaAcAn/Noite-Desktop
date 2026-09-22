import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, Pencil, Play, Plus, Save, X } from 'lucide-react';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { planRepository } from '../../lib/repositories';
import { useSpace } from '../../hooks/use-space';
import { useLibraryList } from '../../hooks/use-library';
import { ModalPortal } from '../../components/ui/Overlay';

const STATUS_LABEL = { draft: 'Sin fecha', scheduled: 'Programado', in_progress: 'En curso' } as const;

export function CalendarPage() {
  const navigate = useNavigate();
  const { space } = useSpace();
  const [searchParams] = useSearchParams();
  const highlightedPlanId = searchParams.get('plan');
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string; startsAt: string; notes: string; selectedIds: Set<string> } | null>(null);
  const pending = useLibraryList({ status: 'pending', pageSize: 500 });
  const library = useLibraryList({ pageSize: 500 });
  useEffect(() => {
    const itemId = searchParams.get('item');
    if (itemId && pending.data?.items.some((item) => item.id === itemId)) {
      setSelectedIds(new Set([itemId]));
    }
  }, [pending.data?.items, searchParams]);
  const plansQuery = useQuery({
    queryKey: ['plans', space?.id],
    queryFn: () => planRepository.list(space!.id),
    enabled: !!space,
  });
  const activePlans = plansQuery.data?.filter((plan) => plan.status !== 'completed' && plan.status !== 'cancelled') ?? [];
  const libraryById = new Map(library.data?.items.map((item) => [item.id, item]) ?? []);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['plans', space?.id] }),
      queryClient.invalidateQueries({ queryKey: ['library'] }),
    ]);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!space || selectedIds.size === 0) return;
    setError(null);
    setCreating(true);
    try {
      const first = pending.data?.items.find((item) => selectedIds.has(item.id));
      await planRepository.create({
        spaceId: space.id,
        title: title.trim() || first?.title || 'Nuevo plan',
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
        libraryItemIds: [...selectedIds],
      });
      setTitle('');
      setStartsAt('');
      setNotes('');
      setSelectedIds(new Set());
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el plan.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell showBack>
      <main className="grid h-full min-h-0 grid-cols-1 grid-rows-2 gap-3 overflow-hidden px-[var(--shell-gutter)] py-[var(--content-pad-y)] md:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)] md:grid-rows-1 md:gap-5">
      <ScrollRegion as="section" label="Crear un plan" className="pr-2 pb-[var(--floating-controls-clearance)]">
        <div className="mb-6 border-l-4 border-category-series pl-4">
          <h1 className="font-display text-2xl font-bold text-noche-text">Planes</h1>
          <p className="compact-height-hide text-sm text-noche-muted">Elige actividades pendientes y, si quieres, ponles fecha.</p>
        </div>

        <form onSubmit={handleCreate} className="mb-8 space-y-4 rounded-2xl border border-noche-border bg-noche-surface p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-noche-muted">
              Título
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Se completa con la primera actividad" className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-4 py-3 text-noche-text" />
            </label>
            <label className="text-sm font-medium text-noche-muted">
              Fecha y hora (opcional)
              <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-4 py-3 text-noche-text" />
            </label>
          </div>
          <label className="block text-sm font-medium text-noche-muted">Notas (opcional)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1.5 w-full resize-none rounded-xl border border-noche-border bg-noche-bg px-4 py-3 text-noche-text" /></label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-noche-muted">Actividades</legend>
            {pending.isLoading && <p className="text-sm text-noche-muted">Cargando pendientes…</p>}
            {pending.data?.items.length === 0 && <div className="rounded-xl border border-dashed border-noche-border p-4"><p className="text-sm text-noche-muted">Todavía no tienes actividades pendientes para este plan.</p><Button type="button" size="sm" className="mt-3" onClick={() => navigate('/actividades/nueva?from=plan')}><Plus size={15} /> Agregar actividad</Button></div>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {pending.data?.items.map((item) => (
                <label key={item.id} className={`group relative aspect-square cursor-pointer overflow-hidden rounded-2xl border transition duration-300 hover:-translate-y-1 hover:shadow-xl focus-within:ring-2 focus-within:ring-[rgb(var(--theme-accent))] ${selectedIds.has(item.id) ? 'border-[rgb(var(--theme-accent))] ring-2 ring-[rgb(var(--theme-accent))]' : 'border-noche-border'}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selectedIds.has(item.id)}
                    onChange={() => setSelectedIds((current) => {
                      const next = new Set(current);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })}
                  />
                  {item.coverUrl ? <img src={item.coverUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <span className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 p-3 text-center font-semibold text-white">{item.title}</span>}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-3 pb-3 pt-8 text-sm font-semibold text-white">{item.title}</span>
                  <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-black/65 text-white">{selectedIds.has(item.id) ? <Check size={16} /> : <span className="h-2.5 w-2.5 rounded-full bg-white/70" />}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={creating || selectedIds.size === 0}>
            <Plus size={16} /> {creating ? 'Guardando…' : 'Crear plan'}
          </Button>
        </form>
      </ScrollRegion>

      <ScrollRegion as="section" label="Planes actuales" className="pl-2 pb-[var(--floating-controls-clearance)]">
        <div className="sticky top-0 z-10 mb-4 pb-3">
          <h2 className="font-display text-xl font-bold text-noche-text">Planes actuales</h2>
          <p className="compact-height-hide text-sm text-noche-muted">Inicia, completa o cancela sin salir de esta vista.</p>
        </div>

        {!plansQuery.isLoading && activePlans.length === 0 && (
          <EmptyState icon={CalendarDays} title="Todavía no hay planes" description="Selecciona una o más ideas pendientes para empezar." />
        )}
        <div className="space-y-3">
          {activePlans.map((plan) => (
            <article id={`plan-${plan.id}`} key={plan.id} className={`rounded-2xl border bg-noche-surface p-4 ${highlightedPlanId === plan.id ? 'border-pink-500 ring-2 ring-pink-200' : 'border-noche-border'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-noche-text">{plan.title}</h2>
                  <p className="text-xs text-noche-muted">
                    {plan.items.length} {plan.items.length === 1 ? 'actividad' : 'actividades'} · {STATUS_LABEL[plan.status as keyof typeof STATUS_LABEL]}
                    {plan.startsAt ? ` · ${new Date(plan.startsAt).toLocaleString('es-PE')}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: plan.id, title: plan.title, startsAt: plan.startsAt ? toLocalInput(plan.startsAt) : '', notes: plan.notes ?? '', selectedIds: new Set(plan.items.map((item) => item.libraryItemId).filter((id): id is string => !!id)) })}><Pencil size={14} /> Editar</Button>
                  {plan.status !== 'in_progress' && <Button size="sm" variant="ghost" onClick={async () => { await planRepository.start(plan.id); await refresh(); }}><Play size={14} /> Iniciar</Button>}
                  {plan.status === 'in_progress' && <Button size="sm" onClick={() => { const itemId = plan.items.find((item) => item.status !== 'completed' && item.libraryItemId)?.libraryItemId; if (itemId) navigate(`/biblioteca/item/${itemId}`); }}><Save size={14} /> Registrar memoria</Button>}
                  <Button size="sm" variant="ghost" onClick={async () => { await planRepository.cancel(plan.id); await refresh(); }}><X size={14} /> Cancelar</Button>
                </div>
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {plan.items.map((item) => {
                  const libraryItem = item.libraryItemId ? libraryById.get(item.libraryItemId) : undefined;
                  return <li key={item.id}><button type="button" disabled={!item.libraryItemId} onClick={() => item.libraryItemId && navigate(`/biblioteca/item/${item.libraryItemId}`)} className="group relative aspect-square w-full overflow-hidden rounded-xl border border-noche-border text-left transition duration-300 hover:-translate-y-1 hover:border-[rgb(var(--theme-accent))] hover:shadow-lg disabled:cursor-default">
                    {libraryItem?.coverUrl ? <img src={libraryItem.coverUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <span className="flex h-full items-center justify-center bg-noche-bg p-3 text-center text-sm font-semibold text-noche-text">{item.titleSnapshot}</span>}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-3 pb-3 pt-8 text-xs font-semibold text-white">{item.titleSnapshot}<span className="mt-1 block font-normal text-white/70">{STATUS_LABEL[plan.status as keyof typeof STATUS_LABEL]}</span></span>
                  </button></li>;
                })}
              </ul>
            </article>
          ))}
        </div>
      </ScrollRegion>
      </main>
      <ModalPortal onClose={() => setEditing(null)}>
      {editing && <div role="dialog" aria-modal="true" aria-labelledby="edit-plan-title" className="fixed inset-0 z-[70] flex justify-end bg-black/60" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditing(null); }}><form className="flex h-full w-full max-w-lg flex-col border-l border-noche-border bg-noche-surface shadow-2xl" onSubmit={async (event) => { event.preventDefault(); await planRepository.update(editing.id, { title: editing.title.trim() || 'Plan', startsAt: editing.startsAt ? new Date(editing.startsAt).toISOString() : null, notes: editing.notes.trim() || null, libraryItemIds: [...editing.selectedIds] }); setEditing(null); await refresh(); }}><header className="flex items-center justify-between border-b border-noche-border p-5"><div><p className="font-title text-xs font-bold uppercase tracking-[0.2em] text-[rgb(var(--theme-accent))]">Noite</p><h2 id="edit-plan-title" className="text-xl font-semibold text-noche-text">Editar plan</h2></div><button type="button" aria-label="Cerrar" className="rounded-full p-2 text-noche-muted hover:bg-noche-bg" onClick={() => setEditing(null)}><X /></button></header><ScrollRegion as="div" label="Opciones del plan" className="flex-1 p-5"><div className="space-y-4"><label className="block text-sm font-medium text-noche-muted">Título<input autoFocus value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} className="mt-1.5 w-full rounded-sm border border-noche-border bg-noche-bg px-4 py-3 text-noche-text" /></label><label className="block text-sm font-medium text-noche-muted">Fecha y hora<input type="datetime-local" value={editing.startsAt} onChange={(event) => setEditing({ ...editing, startsAt: event.target.value })} className="mt-1.5 w-full rounded-sm border border-noche-border bg-noche-bg px-4 py-3 text-noche-text" /></label><label className="block text-sm font-medium text-noche-muted">Notas<textarea rows={3} value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} className="mt-1.5 w-full resize-none rounded-sm border border-noche-border bg-noche-bg px-4 py-3 text-noche-text" /></label><fieldset><legend className="mb-2 text-sm font-medium text-noche-muted">Actividades</legend><div className="grid gap-2">{[...(plansQuery.data?.find((plan) => plan.id === editing.id)?.items.map((item) => ({ id: item.libraryItemId, title: item.titleSnapshot })) ?? []), ...(pending.data?.items.map((item) => ({ id: item.id, title: item.title })) ?? [])].filter((item, index, all) => item.id && all.findIndex((candidate) => candidate.id === item.id) === index).map((item) => <label key={item.id} className="flex items-center gap-3 rounded-sm bg-noche-bg p-3 text-sm text-noche-text"><input type="checkbox" checked={editing.selectedIds.has(item.id!)} onChange={() => { const selectedIds = new Set(editing.selectedIds); if (selectedIds.has(item.id!)) selectedIds.delete(item.id!); else selectedIds.add(item.id!); setEditing({ ...editing, selectedIds }); }} />{item.title}</label>)}</div></fieldset></div></ScrollRegion><footer className="flex justify-end gap-2 border-t border-noche-border p-5"><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" disabled={editing.selectedIds.size === 0}><Save size={15} /> Guardar cambios</Button></footer></form></div>}
      </ModalPortal>
    </AppShell>
  );
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
