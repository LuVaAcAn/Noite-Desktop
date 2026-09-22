import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
import { EmptyState } from '../../components/ui/EmptyState';
import { LibraryItemCard } from './LibraryItemCard';
import { CoverSearchModal } from './CoverSearchModal';
import { ItemContextMenu } from '../../components/ui/ItemContextMenu';
import { ArchiveUndo } from '../../components/ui/ArchiveUndo';
import { useLibraryList } from '../../hooks/use-library';
import { useSectionItemActions } from './use-section-item-actions';
import { cacheCoverAsset } from '../../lib/cache-cover';
import { useGameLaunchActions } from '../../hooks/use-game-launch-actions';
import { GameInstallationChooser } from '../../components/ui/GameInstallationChooser';

// Punto 4 del feedback: "Buscar actividad" debe buscar en toda la
// biblioteca, sin importar en qué categoría estabas parado — por eso esta
// página no recibe ningún filtro de kind/categoría, solo el término.
export function SearchResultsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = (params.get('q') ?? '').trim();

  const { data, isLoading, isError, refetch } = useLibraryList({ search: query || '\u0000', pageSize: 500 });
  const {
    toggleFavorite,
    updateItem,
    completeItem,
    archiveItem,
    menu,
    setMenu,
    activeItem,
    coverSearchItemId,
    setCoverSearchItemId,
    coverSearchItem,
    lastArchived,
    dismissArchive,
    undoArchive,
  } = useSectionItemActions(data?.items);
  const gameLaunch = useGameLaunchActions(data?.items.filter((item) => item.kind === 'video_game').map((item) => item.id) ?? []);

  return (
    <AppShell navigation>
      <ScrollRegion label="Resultados de búsqueda" className="app-route-content px-[var(--shell-gutter)] pb-5 pt-4">
        <div className="mb-6 border-l-4 border-[rgb(var(--theme-accent))] py-2 pl-4">
          <h1 className="font-display text-2xl font-bold text-noche-text">
            Resultados para "{query}"
          </h1>
          <p className="compact-height-hide text-sm text-noche-muted">En toda la biblioteca, sin importar la categoría</p>
        </div>

        {isLoading && (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-2xl bg-noche-surface" />
            ))}
          </div>
        )}
        {isError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">No se pudo buscar. <button className="underline" onClick={() => refetch()}>Reintentar</button></div>}

        {!isLoading && data && data.items.length === 0 && (
          <EmptyState icon={Search} title="Sin resultados" description={`Nada coincide con "${query}" todavía.`} />
        )}

        {!isLoading && data && data.items.length > 0 && (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9">
            {data.items.map((item) => (
              <LibraryItemCard
                key={item.id}
                item={item}
                size="compact"
                onOpen={() => navigate(`/biblioteca/item/${item.id}`)}
                onToggleFavorite={() => toggleFavorite.mutate({ id: item.id, isFavorite: !item.isFavorite })}
                onContextMenu={(e) => setMenu({ x: e.clientX, y: e.clientY, itemId: item.id })}
              />
            ))}
          </div>
        )}
      </ScrollRegion>

      {menu && activeItem && (
        <ItemContextMenu
          x={menu.x}
          y={menu.y}
          itemTitle={activeItem.title}
          isFavorite={activeItem.isFavorite}
          status={activeItem.status}
          onClose={() => setMenu(null)}
          onToggleFavorite={() => toggleFavorite.mutate({ id: activeItem.id, isFavorite: !activeItem.isFavorite })}
          onReset={() => updateItem.mutate({ id: activeItem.id, input: { status: 'pending' } })}
          onComplete={() => completeItem.mutate(activeItem.id)}
          onDelete={() => archiveItem.mutate(activeItem.id)}
          onRename={(title) => updateItem.mutate({ id: activeItem.id, input: { title } })}
          onCopyName={() => navigator.clipboard.writeText(activeItem.title)}
          onChangeCover={() => setCoverSearchItemId(activeItem.id)}
          onPlay={activeItem.kind === 'video_game' && gameLaunch.hasLaunchable(activeItem.id) ? () => gameLaunch.launchForItem(activeItem.id) : undefined}
        />
      )}

      {coverSearchItemId && coverSearchItem && (
        <CoverSearchModal
          initialQuery={coverSearchItem.title}
          kind={coverSearchItem.kind}
          onClose={() => setCoverSearchItemId(null)}
          onSelect={async (result) => {
            const asset = await cacheCoverAsset(result.coverUrl);
            await updateItem.mutateAsync({ id: coverSearchItemId, input: { coverUrl: result.coverUrl ?? undefined, customCoverPath: asset?.storagePath || null } });
            setCoverSearchItemId(null);
          }}
        />
      )}
      {lastArchived && <ArchiveUndo title={lastArchived.title} onUndo={undoArchive} onDismiss={dismissArchive} />}
      {gameLaunch.chooserItemId && <GameInstallationChooser installations={gameLaunch.chooserInstallations} busy={gameLaunch.choosing} onChoose={(id, remember) => void gameLaunch.choose(id, remember)} onClose={gameLaunch.closeChooser} />}
    </AppShell>
  );
}
