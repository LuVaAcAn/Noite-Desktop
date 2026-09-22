import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Tv } from 'lucide-react';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
import { Pagination } from '../../components/ui/Pagination';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ItemContextMenu } from '../../components/ui/ItemContextMenu';
import { ArchiveUndo } from '../../components/ui/ArchiveUndo';
import { LibraryItemCard } from './LibraryItemCard';
import { CoverSearchModal } from './CoverSearchModal';
import { useLibraryList } from '../../hooks/use-library';
import { useSettings } from '../../hooks/use-settings';
import { resolveSection } from './section-resolver';
import { useSectionItemActions } from './use-section-item-actions';
import { cacheCoverAsset } from '../../lib/cache-cover';
import { newActivityPath } from './new-activity-route';
import { useGameLaunchActions } from '../../hooks/use-game-launch-actions';
import { GameInstallationChooser } from '../../components/ui/GameInstallationChooser';

export function LibraryAllPage() {
  const { section = '' } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const resolved = resolveSection(section, settings?.customCategories ?? []);

  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [section]);

  const { data, isLoading } = useLibraryList({
    ...resolved.filters,
    page,
    pageSize: 24,
  });

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

  if (!resolved.isKnown) {
    return <AppShell navigation><ScrollRegion label="Categoría no encontrada" className="px-8 py-16 text-center"><h1 className="text-2xl font-bold text-noche-text">Categoría no encontrada</h1><Button className="mt-4" onClick={() => navigate('/')}>Volver al inicio</Button></ScrollRegion></AppShell>;
  }

  return (
    <AppShell navigation activeSection={section}>
      <ScrollRegion label={`Todas: ${resolved.title}`} className="app-route-content px-[var(--shell-gutter)] pb-6 pt-3">
        <div className="mb-6 flex items-end justify-between pb-1">
          <div className="border-l-4 border-[rgb(var(--theme-accent))] pl-4">
            <h1 className="font-display text-2xl font-bold text-noche-text">Todas: {resolved.title}</h1>
            <p className="text-sm text-noche-muted">{resolved.subtitle}</p>
          </div>
          {data && data.totalPages > 1 && (
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          )}
        </div>

        {isLoading && (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-2xl bg-noche-surface" />
            ))}
          </div>
        )}
        {!isLoading && !data && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">No se pudo abrir esta categoría.</p>}

        {!isLoading && data && data.items.length === 0 && (
          <EmptyState
            icon={Tv}
            title="Todavía no hay nada aquí"
            description="Registra la primera actividad de esta categoría."
            action={
              <Button onClick={() => navigate(newActivityPath(section))} size="sm">
                + Nueva actividad
              </Button>
            }
          />
        )}

        {!isLoading && data && data.items.length > 0 && (
          // Tiles más chicos y densos que la vista previa — punto 4 del
          // feedback: cuadrados para juegos (estilo Wii U), rectángulos más
          // pequeños para el resto.
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

        <div className="mt-10 flex justify-center">
          <Button onClick={() => navigate(newActivityPath(section))}>+ Nueva actividad</Button>
          {section === 'juegos' && <Button className="ml-3" variant="secondary" onClick={() => navigate('/juegos/instalados')}>Buscar instalados</Button>}
        </div>
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
