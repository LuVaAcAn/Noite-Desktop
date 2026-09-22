import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Gamepad2, HardDrive, Loader2, RefreshCcw, Store } from 'lucide-react';
import type { GameScanReport, GameStore, LibraryItem, ProviderScanResult } from '@proyecto-noche/domain';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
import { Button } from '../../components/ui/Button';
import { useCommitGameImport, useGameScanReport, useScanInstalledGames } from '../../hooks/use-game-discovery';
import { useLibraryList } from '../../hooks/use-library';
import { useSettings } from '../../hooks/use-settings';
import { useSpace } from '../../hooks/use-space';
import { onGameScanProgress } from '../../lib/native-game-discovery';
import { groupCandidates, normalizedTitle } from './game-discovery-grouping';

const STORE_LABEL: Record<GameStore, string> = {
  steam: 'Steam', epic: 'Epic Games', gog: 'GOG', xbox: 'Xbox / Microsoft Store',
  ea: 'EA', ubisoft: 'Ubisoft', battlenet: 'Battle.net', manual: 'Manual',
};

type ReviewChoice = 'create' | 'ignore' | `link:${string}`;

function newGameItem(title: string, spaceId: string, actorId: string): LibraryItem {
  const now = new Date().toISOString();
  return {
    id: `item-game-${globalThis.crypto.randomUUID()}`, spaceId, title, kind: 'video_game', status: 'pending',
    description: null, coverUrl: null, customCoverPath: null, externalProvider: 'manual', externalId: null,
    externalUrl: null, estimatedMinutes: null, priority: 'medium', tags: [], isFavorite: false, ideaBy: null,
    customCategoryId: null, metadata: {}, createdBy: actorId, updatedBy: actorId, createdAt: now, updatedAt: now, archivedAt: null,
  };
}

export function GameDiscoveryPage() {
  const navigate = useNavigate();
  const { space } = useSpace();
  const { data: settings } = useSettings();
  const library = useLibraryList({ kind: 'video_game', pageSize: 1_000 });
  const scan = useScanInstalledGames();
  const savedReport = useGameScanReport();
  const commit = useCommitGameImport();
  const [report, setReport] = useState<GameScanReport | null>(null);
  const [choices, setChoices] = useState<Record<string, ReviewChoice>>({});
  const [storeFilter, setStoreFilter] = useState<GameStore | 'all'>('all');
  const [progress, setProgress] = useState<ProviderScanResult[]>([]);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void onGameScanProgress((provider) => {
      setProgress((current) => [...current.filter((value) => value.store !== provider.store), provider]);
    }).then((dispose) => {
      if (disposed) dispose(); else unlisten = dispose;
    });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    if (!report && savedReport.data) setReport(savedReport.data);
  }, [report, savedReport.data]);

  const groups = useMemo(() => groupCandidates(report?.candidates ?? []), [report]);
  useEffect(() => {
    if (!report || !library.data) return;
    setChoices((current) => {
      const next = { ...current };
      for (const group of groups) {
        if (next[group.key]) continue;
        const linked = group.candidates.find((candidate) => candidate.linkedLibraryItemId)?.linkedLibraryItemId;
        const exact = library.data.items.find((item) => normalizedTitle(item.title) === group.key)?.id;
        next[group.key] = linked ? `link:${linked}` : exact ? `link:${exact}` : group.candidates.every((candidate) => candidate.ignored) ? 'ignore' : 'create';
      }
      return next;
    });
  }, [groups, library.data, report]);

  const visibleGroups = groups.filter((group) => storeFilter === 'all' || group.candidates.some((candidate) => candidate.store === storeFilter));
  const stores = [...new Set((report?.candidates ?? []).map((candidate) => candidate.store))];

  async function saveReview() {
    if (!space || !settings) return;
    const newItems: LibraryItem[] = [];
    const bindings: { installationId: string; libraryItemId: string; preferred?: boolean }[] = [];
    const ignoredInstallationIds: string[] = [];
    for (const group of groups) {
      const choice = choices[group.key] ?? 'ignore';
      if (choice === 'ignore') {
        ignoredInstallationIds.push(...group.candidates.map((candidate) => candidate.installationId));
        continue;
      }
      let libraryItemId: string;
      if (choice === 'create') {
        const item = newGameItem(group.title, space.id, settings.activeProfileId);
        newItems.push(item);
        libraryItemId = item.id;
      } else libraryItemId = choice.slice(5);
      group.candidates.forEach((candidate, index) => bindings.push({ installationId: candidate.installationId, libraryItemId, preferred: index === 0 }));
    }
    await commit.mutateAsync({ newItems, bindings, ignoredInstallationIds });
    navigate('/biblioteca/juegos', { replace: true });
  }

  return (
    <AppShell showBack activeSection="juegos">
      <ScrollRegion label="Juegos instalados" className="app-route-content px-[var(--shell-gutter)] pb-8 pt-4">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[rgb(var(--theme-accent))]">Solo en este equipo</p><h1 className="mt-1 font-display text-3xl font-bold text-noche-text">Juegos instalados</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-noche-muted">Noite revisa inventarios de launchers y accesos directos conocidos. Elige qué títulos compartir en la biblioteca; las rutas permanecen únicamente en esta PC.</p></div>
            <Button variant="secondary" disabled={scan.isPending} onClick={() => { setProgress([]); scan.mutate(undefined, { onSuccess: setReport }); }}><RefreshCcw size={15} className={scan.isPending ? 'animate-spin' : ''} /> Escanear otra vez</Button>
          </div>

          {scan.isPending && <div className="mt-8 flex min-h-52 flex-col items-center justify-center rounded-2xl border border-noche-border bg-noche-surface p-8 text-center"><Loader2 size={34} className="animate-spin text-[rgb(var(--theme-accent))]" /><h2 className="mt-4 font-semibold text-noche-text">Buscando juegos instalados…</h2><p className="mt-2 text-sm text-noche-muted">{progress.length === 0 ? 'Preparando el escaneo local…' : `${STORE_LABEL[progress.at(-1)!.store]} revisado · ${progress.length} de 7 tiendas`}</p></div>}
          {scan.isError && <div role="alert" className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300"><AlertTriangle className="mb-2" />{scan.error instanceof Error ? scan.error.message : 'No se pudo iniciar el escaneo.'}<Button className="mt-4" size="sm" onClick={() => scan.mutate(undefined, { onSuccess: setReport })}>Reintentar</Button></div>}
          {!report && !scan.isPending && !scan.isError && !savedReport.isPending && <div className="mt-8 flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-noche-border p-8 text-center"><HardDrive size={34} className="text-noche-muted" /><h2 className="mt-4 font-semibold text-noche-text">Escaneo listo para comenzar</h2><p className="mt-2 max-w-lg text-sm text-noche-muted">Solo se revisarán inventarios conocidos de launchers y accesos directos. Noite no recorrerá tus discos completos.</p><Button className="mt-5" onClick={() => scan.mutate(undefined, { onSuccess: setReport })}>Escanear ahora</Button></div>}

          {report && !scan.isPending && <>
            <section className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {report.providers.map((provider) => <div key={provider.store} className="rounded-xl border border-noche-border bg-noche-surface px-4 py-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-noche-text">{STORE_LABEL[provider.store]}</span><span className={`h-2.5 w-2.5 rounded-full ${provider.status === 'error' ? 'bg-red-400' : provider.status === 'partial' ? 'bg-amber-400' : provider.found > 0 ? 'bg-emerald-400' : 'bg-white/20'}`} /></div><p className="mt-1 text-xs text-noche-muted">{provider.status === 'error' ? 'No se pudo revisar' : `${provider.found} hallazgo${provider.found === 1 ? '' : 's'}`}</p>{provider.warnings.map((warning) => <p key={warning} className="mt-1 text-[11px] leading-4 text-amber-300">{warning}</p>)}</div>)}
            </section>

            {stores.length > 1 && <div className="mt-6 flex flex-wrap gap-2"><button onClick={() => setStoreFilter('all')} className={`rounded-full px-3 py-1.5 text-xs ${storeFilter === 'all' ? 'bg-[rgb(var(--theme-accent))] text-white' : 'bg-noche-surface text-noche-muted'}`}>Todas</button>{stores.map((store) => <button key={store} onClick={() => setStoreFilter(store)} className={`rounded-full px-3 py-1.5 text-xs ${storeFilter === store ? 'bg-[rgb(var(--theme-accent))] text-white' : 'bg-noche-surface text-noche-muted'}`}>{STORE_LABEL[store]}</button>)}</div>}

            {groups.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-noche-border p-10 text-center"><HardDrive className="mx-auto text-noche-muted" /><h2 className="mt-3 font-semibold text-noche-text">No se encontraron juegos</h2><p className="mt-2 text-sm text-noche-muted">Puedes terminar la revisión y asociar ejecutables manualmente desde el detalle de un juego.</p></div> : <div className="mt-5 space-y-3">{visibleGroups.map((group) => <article key={group.key} className="grid gap-4 rounded-2xl border border-noche-border bg-noche-surface p-4 md:grid-cols-[minmax(0,1fr)_280px] md:items-center"><div className="flex min-w-0 items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[rgb(var(--theme-accent)/.15)] text-[rgb(var(--theme-accent))]"><Gamepad2 /></span><div className="min-w-0"><h2 className="truncate font-semibold text-noche-text">{group.title}</h2><div className="mt-1 flex flex-wrap gap-1.5">{group.candidates.map((candidate) => <span key={candidate.installationId} className="rounded-full bg-noche-bg px-2 py-1 text-[11px] text-noche-muted"><Store size={11} className="mr-1 inline" />{STORE_LABEL[candidate.store]}{!candidate.launchable ? ' · requiere ejecutable' : ''}</span>)}</div></div></div><select aria-label={`Destino para ${group.title}`} value={choices[group.key] ?? 'ignore'} onChange={(event) => setChoices((current) => ({ ...current, [group.key]: event.target.value as ReviewChoice }))} className="w-full rounded-xl border border-noche-border bg-noche-bg px-3 py-2.5 text-sm text-noche-text"><option value="create">Crear actividad nueva</option>{library.data?.items.map((item) => <option key={item.id} value={`link:${item.id}`}>Vincular con: {item.title}</option>)}<option value="ignore">Ignorar en este equipo</option></select></article>)}</div>}

            <div className="sticky bottom-3 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-noche-border bg-noche-surface/95 p-4 shadow-2xl backdrop-blur"><p className="text-sm text-noche-muted"><Check size={15} className="mr-1 inline text-emerald-400" />{groups.filter((group) => choices[group.key] !== 'ignore').length} títulos se añadirán o vincularán.</p><Button disabled={commit.isPending || !settings || !space} onClick={() => void saveReview()}>{commit.isPending ? 'Guardando…' : 'Guardar selección'}</Button></div>
            {commit.isError && <p role="alert" className="mt-3 text-sm text-red-400">{commit.error instanceof Error ? commit.error.message : 'No se pudo guardar la selección.'}</p>}
          </>}
        </div>
      </ScrollRegion>
    </AppShell>
  );
}
