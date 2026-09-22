import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { Tv } from 'lucide-react';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
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
import { controllerSelection, rememberControllerSelection } from '../../lib/controller-utils';
import { newActivityPath } from './new-activity-route';
import { useGameLaunchActions } from '../../hooks/use-game-launch-actions';
import { GameInstallationChooser } from '../../components/ui/GameInstallationChooser';

const PREVIEW_COUNT = 7;

export function LibraryPreviewPage() {
  const { section = '' } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const resolved = resolveSection(section, settings?.customCategories ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(() => controllerSelection(`library-${section}`));

  const { data, isLoading } = useLibraryList({ ...resolved.filters, page: 1, pageSize: PREVIEW_COUNT });
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
      <ScrollRegion label={`Biblioteca: ${resolved.title}`} className="app-route-content px-[var(--shell-gutter)] pb-6 pt-3">
        <div className="mb-3 border-l-4 border-[rgb(var(--theme-accent))] pl-4">
            <h1 className="font-display text-2xl font-bold text-noche-text">{resolved.title} recientes</h1>
          <p className="compact-height-hide text-sm text-noche-muted">{resolved.subtitle}</p>
        </div>

        {isLoading && (
          <div className="flex gap-5 overflow-x-hidden pb-12 pt-3">
            {Array.from({ length: PREVIEW_COUNT }).map((_, i) => (
              <div key={i} className="aspect-[2/3] w-[clamp(118px,11vw,150px)] shrink-0 animate-pulse rounded-[14px] bg-noche-surface" />
            ))}
          </div>
        )}

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
          <div data-controller-scope="recent" className="flex snap-x items-center justify-center gap-6 overflow-x-auto overflow-y-hidden px-5 pb-14 pt-5 overscroll-x-contain">
            {data.items.map((item) => (
              <div key={item.id} className="w-[clamp(138px,12.5vw,178px)] shrink-0 snap-center"><LibraryItemCard
                  item={item}
                  size="preview"
                  selected={(selectedId ?? data.items[0]?.id) === item.id}
                  reflection
                  onFocus={() => { setSelectedId(item.id); rememberControllerSelection(`library-${section}`, item.id); }}
                  onOpen={() => navigate(`/biblioteca/item/${item.id}`)}
                  onToggleFavorite={() => toggleFavorite.mutate({ id: item.id, isFavorite: !item.isFavorite })}
                  onContextMenu={(e) => setMenu({ x: e.clientX, y: e.clientY, itemId: item.id })}
                /></div>
            ))}
          </div>
        )}

        <div className="mt-1 flex justify-center gap-3">
          <Button onClick={() => navigate(newActivityPath(section))}>+ Nueva actividad</Button>
          {section === 'juegos' && <Button variant="secondary" onClick={() => navigate('/juegos/instalados')}>Buscar instalados</Button>}
          {data && data.totalItems > 0 && (
            <Button variant="secondary" onClick={() => navigate(`/biblioteca/${section}/todos`)}>
              {section === 'juegos' ? 'Todos los juegos' : section === 'peliculas' ? 'Todas las películas' : section === 'series' ? 'Todas las series' : section === 'favoritos' ? 'Todos los favoritos' : `Todo: ${resolved.title}`} {data.totalItems > PREVIEW_COUNT ? `(${data.totalItems})` : ''}
            </Button>
          )}
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
