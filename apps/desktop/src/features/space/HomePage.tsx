import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { CalendarDays, HardDrive, Film, Image, Music2, Sparkles } from 'lucide-react';
import type { CoverSearchResult } from '@proyecto-noche/domain';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ItemContextMenu } from '../../components/ui/ItemContextMenu';
import { ArchiveUndo } from '../../components/ui/ArchiveUndo';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { LibraryItemCard } from '../library/LibraryItemCard';
import { CoverSearchModal } from '../library/CoverSearchModal';
import { useArchiveLibraryItem, useCompleteLibraryItem, useLibraryList, useRestoreLibraryItem, useToggleFavorite, useUpdateLibraryItem } from '../../hooks/use-library';
import { useSpace } from '../../hooks/use-space';
import { cacheCoverAsset } from '../../lib/cache-cover';
import { controllerSelection, rememberControllerSelection } from '../../lib/controller-utils';
import { ControllerFocusScope } from '../../components/ui/ControllerFocusScope';
import { useSettings } from '../../hooks/use-settings';
import { ArcadeLottie } from '../../components/ui/ArcadeLottie';
import { useAuth } from '../../hooks/use-auth';

import { useGameLaunchActions } from '../../hooks/use-game-launch-actions';
import { GameInstallationChooser } from '../../components/ui/GameInstallationChooser';

const RECENT_COUNT = 7;

export function HomePage() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { data: settings } = useSettings();
  const auth = useAuth();
  const { space } = useSpace();
  const { data, isLoading } = useLibraryList({ page: 1, pageSize: RECENT_COUNT });
  const toggleFavorite = useToggleFavorite(); const updateItem = useUpdateLibraryItem(); const archiveItem = useArchiveLibraryItem(); const restoreItem = useRestoreLibraryItem(); const completeItem = useCompleteLibraryItem();
  const [menu, setMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [coverSearchItemId, setCoverSearchItemId] = useState<string | null>(null);
  const [lastArchived, setLastArchived] = useState<{ id: string; title: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => controllerSelection('home-recent'));
  const gameLaunch = useGameLaunchActions(data?.items.filter((item) => item.kind === 'video_game').map((item) => item.id) ?? []);
  const activeItem = useMemo(() => data?.items.find((item) => item.id === menu?.itemId) ?? null, [data, menu]);

  return <AppShell navigation><ScrollRegion label="Inicio" className="app-route-content px-[var(--shell-gutter)] pb-8 pt-4">
    <motion.section initial={reducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[30px] border border-purple-400/20 bg-noche-surface p-6 shadow-[0_24px_80px_rgba(88,28,135,.22)] sm:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(168,85,247,.24),transparent_34%),radial-gradient(circle_at_88%_70%,rgba(76,29,149,.20),transparent_35%)]" />
      {!reducedMotion && <><motion.span aria-hidden className="absolute right-[12%] top-8 h-2 w-2 rounded-full bg-purple-200" animate={{ opacity: [.2, 1, .2], scale: [1, 1.5, 1] }} transition={{ duration: 3.2, repeat: Infinity }} /><motion.span aria-hidden className="absolute right-[25%] top-[58%] h-1.5 w-1.5 rounded-full bg-fuchsia-300" animate={{ opacity: [1, .2, 1] }} transition={{ duration: 2.4, repeat: Infinity }} /></>}
      <div className="relative grid items-center gap-7 lg:grid-cols-[1fr_auto]">
        <div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-purple-700"><Sparkles size={14} /> {space?.name}</div><h1 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight text-noche-text sm:text-4xl">Hola, {auth.user?.displayName ?? 'tú'}.<br /><span className="text-noche-muted">¿Qué historia quieren vivir hoy?</span></h1><p className="mt-3 max-w-xl text-sm leading-6 text-noche-muted">Guarden lo que disfrutaron, preparen el próximo plan y vuelvan a sus recuerdos desde un solo lugar.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => navigate('/actividades/nueva?modo=recuerdo')}>+ Registrar un recuerdo</Button><Button variant="secondary" onClick={() => navigate('/calendario')}><CalendarDays size={16} /> Planear algo</Button></div>
        </div>
        <div className="flex items-center justify-center lg:min-w-64"><div className="relative flex items-center"><ArcadeLottie variant="burst" className="pointer-events-none absolute -inset-16 h-56 w-56 text-purple-700 opacity-55" /><ProfileAvatar name={settings?.userName ?? 'Tú'} src={settings?.userAvatarUrl} className="relative h-24 w-24 border-4 border-noche-surface text-3xl shadow-xl" /><div className="relative -ml-5 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 p-1"><ProfileAvatar name={settings?.partnerName ?? 'Pareja'} src={settings?.partnerAvatarUrl} className="h-24 w-24 border-4 border-noche-surface text-3xl" /></div><motion.span aria-hidden animate={reducedMotion ? undefined : { rotate: 360 }} transition={{ duration: 18, ease: 'linear', repeat: Infinity }} className="absolute -inset-4 rounded-full border border-dashed border-purple-300/25" /></div></div>
      </div>
      <div className="relative mt-6 flex items-center gap-2 border-t border-noche-border pt-4 text-xs text-noche-muted"><HardDrive size={14} className="text-purple-700" />Guardado en esta computadora</div>
    </motion.section>

    <section className="mt-8"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-purple-400">Su historia</p><h2 className="mt-1 font-display text-2xl font-bold text-noche-text">Actividades recientes</h2><p className="mt-1 text-sm text-noche-muted">Lo que han disfrutado juntos últimamente</p></div><button className="text-sm font-semibold text-[rgb(var(--theme-accent))]" onClick={() => navigate('/biblioteca/todas/todos')}>Ver todas</button></div>
      <div className="mt-4">{isLoading && <div className="flex justify-center gap-6 overflow-hidden py-5">{Array.from({ length: 7 }).map((_, index) => <div key={index} className="aspect-[2/3] w-[150px] shrink-0 animate-pulse rounded-2xl bg-noche-surface" />)}</div>}
        {!isLoading && data?.items.length === 0 && <EmptyState icon={Film} title="Su primera noche empieza aquí" description="Registren una película, una partida, una canción o cualquier momento que quieran recordar." action={<Button onClick={() => navigate('/actividades/nueva?modo=recuerdo')} size="sm">Registrar el primer recuerdo</Button>} />}
        {!isLoading && data && data.items.length > 0 && <ControllerFocusScope scope="recent" aria-label="Actividades recientes" className="flex snap-x items-center justify-center gap-6 overflow-x-auto px-5 pb-12 pt-5">{data.items.map((item) => <motion.div key={item.id} whileHover={reducedMotion ? undefined : { y: -7, scale: 1.045 }} whileFocus={reducedMotion ? undefined : { y: -7, scale: 1.045 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }} className="w-[clamp(145px,13vw,184px)] shrink-0 snap-center"><LibraryItemCard item={item} size="preview" selected={(selectedId ?? data.items[0]?.id) === item.id} reflection onFocus={() => { setSelectedId(item.id); rememberControllerSelection('home-recent', item.id); }} onOpen={() => navigate(`/biblioteca/item/${item.id}`)} onToggleFavorite={() => toggleFavorite.mutate({ id: item.id, isFavorite: !item.isFavorite })} onContextMenu={(event) => setMenu({ x: event.clientX, y: event.clientY, itemId: item.id })} /></motion.div>)}</ControllerFocusScope>}
      </div>
    </section>

    <section className="mt-2 grid gap-3 sm:grid-cols-3"><QuickCard icon={Music2} label="Música" description="La banda sonora de sus recuerdos" onClick={() => navigate('/musica')} /><QuickCard icon={Image} label="Galería" description="Fotos guardadas juntos" onClick={() => navigate('/galeria')} /><QuickCard icon={Sparkles} label="Destino" description="Dejen que Noite elija" onClick={() => navigate('/sesion')} /></section>
  </ScrollRegion>

  {menu && activeItem && <ItemContextMenu x={menu.x} y={menu.y} itemTitle={activeItem.title} isFavorite={activeItem.isFavorite} status={activeItem.status} onClose={() => setMenu(null)} onToggleFavorite={() => toggleFavorite.mutate({ id: activeItem.id, isFavorite: !activeItem.isFavorite })} onReset={() => updateItem.mutate({ id: activeItem.id, input: { status: 'pending' } })} onComplete={() => completeItem.mutate(activeItem.id)} onDelete={() => archiveItem.mutate(activeItem.id, { onSuccess: () => setLastArchived({ id: activeItem.id, title: activeItem.title }) })} onRename={(title) => updateItem.mutate({ id: activeItem.id, input: { title } })} onCopyName={() => navigator.clipboard.writeText(activeItem.title)} onChangeCover={() => setCoverSearchItemId(activeItem.id)} onPlay={activeItem.kind === 'video_game' && gameLaunch.hasLaunchable(activeItem.id) ? () => gameLaunch.launchForItem(activeItem.id) : undefined} />}
  {coverSearchItemId && <CoverSearchModal initialQuery={data?.items.find((item) => item.id === coverSearchItemId)?.title ?? ''} kind={data?.items.find((item) => item.id === coverSearchItemId)?.kind ?? 'other'} onClose={() => setCoverSearchItemId(null)} onSelect={async (result: CoverSearchResult) => { const asset = await cacheCoverAsset(result.coverUrl); await updateItem.mutateAsync({ id: coverSearchItemId, input: { coverUrl: result.coverUrl ?? undefined, customCoverPath: asset?.storagePath || null } }); setCoverSearchItemId(null); }} />}
  {lastArchived && <ArchiveUndo title={lastArchived.title} onDismiss={() => setLastArchived(null)} onUndo={() => restoreItem.mutate(lastArchived.id, { onSuccess: () => setLastArchived(null) })} />}
  {gameLaunch.chooserItemId && <GameInstallationChooser installations={gameLaunch.chooserInstallations} busy={gameLaunch.choosing} onChoose={(id, remember) => void gameLaunch.choose(id, remember)} onClose={gameLaunch.closeChooser} />}
  </AppShell>;
}

function QuickCard({ icon: Icon, label, description, onClick }: { icon: typeof Music2; label: string; description: string; onClick(): void }) { return <button onClick={onClick} className="group flex items-center gap-4 rounded-2xl border border-noche-border bg-noche-surface p-4 text-left transition hover:-translate-y-1 hover:border-purple-400/35 hover:shadow-lg"><span className="grid h-11 w-11 place-items-center rounded-xl bg-purple-500/12 text-purple-400 transition group-hover:bg-purple-500/20"><Icon size={20} /></span><span><strong className="block text-sm text-noche-text">{label}</strong><small className="text-xs text-noche-muted">{description}</small></span></button>; }
