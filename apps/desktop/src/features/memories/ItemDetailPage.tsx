import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Gamepad2, Images, Play, Quote } from 'lucide-react';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
import { StarRating } from '../../components/ui/StarRating';
import { Button } from '../../components/ui/Button';
import { useLibraryItem } from '../../hooks/use-library';
import { usePlanItemForLibraryItem } from '../../hooks/use-plan-item-for-library-item';
import { useRemoveTrack, useReviewSummary, useSetSpotifyTrack, useSetTrack, useUpsertReview } from '../../hooks/use-reviews';
import { useSpace } from '../../hooks/use-space';
import { useAuth } from '../../hooks/use-auth';
import { SpotifyTrackPicker } from '../music/SpotifyTrackPicker';
import { cacheCoverAsset } from '../../lib/cache-cover';
import { planRepository } from '../../lib/repositories';
import { openExternal } from '../../lib/system-status';
import { useQueryClient } from '@tanstack/react-query';
import { ArcadeLottie } from '../../components/ui/ArcadeLottie';
import { useAttachSavedMusic, useSavedMusic } from '../../hooks/use-music';
import { MusicArtwork } from '../../components/ui/MusicArtwork';
import { OverlayNotice } from '../../components/ui/Overlay';
import { collapsedReview, completedDateLabel } from './review-display';
import { useSettings } from '../../hooks/use-settings';
import { useUiStore } from '../../stores/ui-store';
import type { MemoryTrack, SavedMusicItem } from '@proyecto-noche/domain';
import { accentFromCategoryColor, defaultAppearance, hexRgb } from '../../lib/section-theme';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { useGameLaunchActions } from '../../hooks/use-game-launch-actions';
import { useAddManualGameInstallation } from '../../hooks/use-game-discovery';
import { GameInstallationChooser } from '../../components/ui/GameInstallationChooser';

const STATUS_LABEL: Record<string, string> = {
  idea: 'Idea',
  pending: 'Pendiente',
  planned: 'Planeado',
  in_progress: 'En curso',
  paused: 'Pausado',
  completed: 'Completado',
  abandoned: 'Abandonado',
  archived: 'Archivado',
};

export function ItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { space, members } = useSpace();
  const { actorId } = useAuth();
  const settings = useSettings();
  const { data: item, isLoading } = useLibraryItem(itemId);
  const { planItem } = usePlanItemForLibraryItem(itemId);
  const { data: summary } = useReviewSummary(planItem?.id);
  const upsertReview = useUpsertReview();
  const setTrack = useSetTrack();
  const removeTrack = useRemoveTrack();
  const setSpotifyTrack = useSetSpotifyTrack();
  const savedMusic = useSavedMusic(space?.id);
  const attachSavedMusic = useAttachSavedMusic(planItem?.id);
  const queryClient = useQueryClient();
  const selectMusicItem = useUiStore((state) => state.selectMusicItem);
  const gameLaunch = useGameLaunchActions(itemId ? [itemId] : []);
  const addManualGame = useAddManualGameInstallation();
  const autoplayedTrack = useRef<string | null>(null);

  const [songDraft, setSongDraft] = useState('');
  const [savedMusicDraft, setSavedMusicDraft] = useState('');
  const [editingTrack, setEditingTrack] = useState(false);
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [showRegistrationSuccess, setShowRegistrationSuccess] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(() => new Set());

  const myReview = summary?.reviews.find((review) => review.userId === actorId);
  const myRating = myReview?.rating ?? 0;
  const associatedSavedMusic = savedMusic.data?.find((music) => music.id === summary?.track?.savedMusicItemId);

  useEffect(() => setCommentDraft(myReview?.comment ?? ''), [myReview?.comment]);
  useEffect(() => {
    const track = summary?.track;
    if (!track || autoplayedTrack.current === track.id) return;
    const playable = associatedSavedMusic ?? (track.provider === 'spotify' ? memoryTrackAsSpotifyItem(track) : null);
    if (!playable) return;
    autoplayedTrack.current = track.id;
    selectMusicItem(playable, !associatedSavedMusic);
  }, [associatedSavedMusic, selectMusicItem, summary?.track]);

  async function registerReview(input: { rating?: number; comment?: string }) {
    if (!space || !planItem) return;
    if (planItem.status !== 'completed') {
      await planRepository.completeItem(planItem.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['plans', space.id] }),
        queryClient.invalidateQueries({ queryKey: ['library'] }),
        queryClient.invalidateQueries({ queryKey: ['library-item', itemId] }),
      ]);
      window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Memoria registrada. Ahora puedes completar sus detalles.' }));
      window.dispatchEvent(new CustomEvent('app-sound', { detail: 'success' }));
      setShowRegistrationSuccess(true);
      window.setTimeout(() => setShowRegistrationSuccess(false), 1_400);
    }
    await upsertReview.mutateAsync({ spaceId: space.id, planItemId: planItem.id, ...input });
  }

  async function completeActivity() {
    if (!item || !space) return;
    setCompleting(true);
    try {
      if (planItem) await planRepository.completeItem(planItem.id);
      else await planRepository.recordCompletedActivity(item.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['plans', space.id] }),
        queryClient.invalidateQueries({ queryKey: ['library'] }),
        queryClient.invalidateQueries({ queryKey: ['library-item', item.id] }),
      ]);
      setShowRegistrationSuccess(true);
      window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Actividad completada. Ya pueden calificarla y comentarla.' }));
      window.dispatchEvent(new CustomEvent('app-sound', { detail: 'success' }));
      window.setTimeout(() => setShowRegistrationSuccess(false), 1_400);
    } finally { setCompleting(false); }
  }

  if (isLoading) {
    return (
      <AppShell showBack><ScrollRegion label="Cargando actividad" className="px-[var(--shell-gutter)] text-noche-muted">Cargando…</ScrollRegion></AppShell>
    );
  }
  if (!item) {
    return <AppShell showBack><ScrollRegion label="Actividad no encontrada" className="px-[var(--shell-gutter)] text-center"><h1 className="text-2xl font-bold text-noche-text">Actividad no encontrada</h1><Button className="mt-4" onClick={() => navigate('/')}>Volver al inicio</Button></ScrollRegion></AppShell>;
  }
  const detailSection = item.kind === 'movie' ? 'peliculas' : item.kind === 'series' || item.kind === 'season_or_episode' ? 'series' : item.kind === 'video_game' ? 'juegos' : item.customCategoryId ?? 'item';
  const customCategory = settings.data?.customCategories.find((category) => category.id === detailSection);
  const configuredDetailAppearance = settings.data?.sectionAppearances[detailSection];
  const detailAppearance = configuredDetailAppearance?.preset === 'custom' ? configuredDetailAppearance : defaultAppearance(detailSection, accentFromCategoryColor(customCategory?.colorHex), settings.data?.colorMode ?? 'dark');
  const detailStyle = { '--theme-accent': hexRgb(detailAppearance.accent) } as CSSProperties;

  return (
    <AppShell showBack>
      <ScrollRegion label={`Memoria: ${item.title}`} style={detailStyle} className="app-route-content rounded-t-3xl bg-noche-bg/45 px-[var(--shell-gutter)] pb-5 pt-5">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[320px_1fr]">
          <div>
            <span className="mb-3 inline-block rounded-full bg-noche-surface px-4 py-1.5 text-xs font-semibold text-noche-text">
              {STATUS_LABEL[item.status]}
            </span>
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-2 border-transparent shadow-glow-cyan">
              {item.coverUrl ? (
                <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-fuchsia-500/30 to-sky-500/20 p-6 text-center font-display text-xl font-bold text-white">
                  {item.title}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 w-full"
              onClick={() => navigate(`/biblioteca/item/${item.id}/galeria`)}
            >
              <Images size={15} /> Ver capturas
            </Button>
            {item.kind === 'video_game' && <div className="mt-2 space-y-2">
              {gameLaunch.hasLaunchable(item.id) && <Button className="w-full" onClick={() => gameLaunch.launchForItem(item.id)}><Play size={16} /> Jugar</Button>}
              {gameLaunch.hasUnavailable(item.id) && !gameLaunch.hasLaunchable(item.id) && <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-center text-xs text-amber-200">No está disponible en este equipo.</p>}
              <Button variant="ghost" size="sm" className="w-full" disabled={addManualGame.isPending} onClick={() => addManualGame.mutate({ libraryItemId:item.id,itemTitle:item.title })}><Gamepad2 size={15} />{gameLaunch.hasLaunchable(item.id) ? 'Asociar otra instalación' : 'Asociar ejecutable'}</Button>
              {(gameLaunch.launchError || addManualGame.error) && <p role="alert" className="text-xs text-red-400">No se pudo abrir o asociar el juego.</p>}
            </div>}
          </div>

          <div>
            <h1 className="font-display text-3xl font-bold text-noche-text">{item.title}</h1>
            {planItem?.status === 'completed' && <p className="mt-2 flex items-center gap-2 text-sm text-noche-muted"><CalendarDays size={15} />{completedDateLabel(planItem.completedAt)}</p>}

            {planItem?.status === 'completed' ? (
              <>
                <div className="mt-3">
                  <StarRating
                    value={myRating}
                    onChange={(value) => void registerReview({ rating: value })}
                  />
                </div>

                <div className="mt-6 rounded-2xl border border-noche-border bg-noche-surface p-6">
                  <Quote size={22} className="mb-3 text-noche-muted" />
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    onBlur={() => void registerReview({ comment: commentDraft })}
                    placeholder="Escribe qué les pareció…"
                    rows={5}
                    className="w-full resize-none bg-transparent text-noche-text placeholder:text-noche-muted focus:outline-none"
                  />
                  {summary && summary.reviews.length > 0 && (
                    <div className="mt-4 border-t border-noche-border pt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-noche-muted">
                        Opiniones individuales · promedio {summary.averageRating?.toFixed(1) ?? 'sin calificar'}
                      </p>
                      <ul className="space-y-2">
                        {summary.reviews.map((review) => {
                          const member = members.find((candidate) => candidate.userId === review.userId);
                          const knownActor = review.userId === 'me' || review.userId === 'partner' ? review.userId : null;
                          const configuredName = knownActor && settings.data
                            ? (knownActor === 'me' ? settings.data.userName : settings.data.partnerName)
                            : '';
                          const configuredAvatar = knownActor && settings.data
                            ? (knownActor === 'me' ? settings.data.userAvatarUrl : settings.data.partnerAvatarUrl)
                            : null;
                          const reviewName = configuredName || member?.displayName || (review.userId === 'me' ? 'Tú' : review.userId === 'partner' ? 'Pareja' : review.userId);
                          const reviewAvatar = configuredAvatar || member?.avatarUrl;
                          const displayComment = review.comment ? collapsedReview(review.comment, expandedReviews.has(review.id)) : null;
                          return <li key={review.id} className="flex items-start gap-2 text-sm text-noche-muted">
                            <ProfileAvatar name={reviewName} src={reviewAvatar} className="h-7 w-7 text-[10px]" />
                            <span className="min-w-0"><span className="font-medium text-noche-text">{reviewName}</span>{review.rating ? ` · ${review.rating}/5` : ''}{displayComment ? <><span> — {displayComment.text}</span>{displayComment.truncated && <button type="button" aria-expanded={expandedReviews.has(review.id)} onClick={() => setExpandedReviews((current) => { const next = new Set(current); if (next.has(review.id)) next.delete(review.id); else next.add(review.id); return next; })} className="ml-1 font-semibold text-[rgb(var(--theme-accent))] underline-offset-2 hover:underline">{expandedReviews.has(review.id) ? 'Ver menos' : 'Ver más'}</button>}</> : null}</span>
                          </li>;
                        })}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-noche-border bg-noche-surface p-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-noche-bg"><MusicArtwork src={associatedSavedMusic?.artworkUrl ?? summary?.track?.coverUrl} alt={summary?.track ? `Portada de ${summary.track.title}` : ''} className="h-full w-full object-cover" /></div>
                  {summary?.track && !editingTrack ? (
                    <div className="flex flex-1 items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium text-noche-text">{summary.track.title}</p>
                        {summary.track.artist && <p className="text-xs text-noche-muted">{summary.track.artist}</p>}
                        {summary.track.externalUrl && summary.track.provider === 'spotify' && (
                          <button type="button" onClick={() => void openExternal(summary.track!.externalUrl)} className="text-pink-600 underline">
                            Abrir enlace
                          </button>
                        )}
                        {summary.track.externalUrl && summary.track.provider === 'manual' && <audio className="mt-2 h-8 max-w-xs" controls preload="metadata" src={summary.track.externalUrl} />}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setSongDraft(summary.track?.externalUrl || summary.track?.title || '');
                          setEditingTrack(true);
                        }}>Cambiar</Button>
                        <Button size="sm" variant="ghost" onClick={() => removeTrack.mutate(planItem.id)}>Quitar</Button>
                      </div>
                    </div>
                  ) : (
                    <form
                      className="flex flex-1 gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (savedMusicDraft) {
                          await attachSavedMusic.mutateAsync(savedMusicDraft);
                          const selectedMusic = savedMusic.data?.find((music) => music.id === savedMusicDraft);
                          if (selectedMusic) selectMusicItem(selectedMusic);
                          setSavedMusicDraft('');
                          setEditingTrack(false);
                          return;
                        }
                        if (!songDraft.trim()) return;
                        await setTrack.mutateAsync({ planItemId: planItem.id, songLink: songDraft.trim() });
                        setSongDraft('');
                        setEditingTrack(false);
                      }}
                    >
                      {savedMusic.data && savedMusic.data.length > 0 && <select value={savedMusicDraft} onChange={(event) => setSavedMusicDraft(event.target.value)} className="min-w-0 flex-1 rounded-lg bg-noche-bg px-3 py-2 text-sm text-noche-text"><option value="">Música guardada…</option>{savedMusic.data.map((music) => <option key={music.id} value={music.id}>{music.title}</option>)}</select>}
                      <input
                        value={songDraft}
                        onChange={(e) => setSongDraft(e.target.value)}
                        placeholder="Pega un link de Spotify o escribe el nombre de la canción"
                        className="flex-1 rounded-lg bg-noche-bg px-3 py-2 text-sm text-noche-text placeholder:text-noche-muted focus:outline-none"
                      />
                      <Button type="submit" size="sm" variant="secondary" disabled={!savedMusicDraft && !songDraft.trim()}>
                        Asociar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setTrackPickerOpen(true)}>Spotify</Button>
                    </form>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-2xl border border-noche-border bg-noche-surface p-6">
                <h2 className="font-semibold text-noche-text">¿Ya vivieron esta actividad?</h2>
                <p className="mt-2 text-sm leading-6 text-noche-muted">Márcala como realizada para crear el recuerdo y habilitar las calificaciones, comentarios, capturas y música.</p>
                <Button className="mt-4" disabled={completing} onClick={() => void completeActivity()}>{completing ? 'Completando…' : 'Marcar como realizada'}</Button>
              </div>
            )}
          </div>
        </div>
      </ScrollRegion>
      {gameLaunch.chooserItemId && <GameInstallationChooser installations={gameLaunch.chooserInstallations} busy={gameLaunch.choosing} onChoose={(id, remember) => void gameLaunch.choose(id, remember)} onClose={gameLaunch.closeChooser} />}
      {trackPickerOpen && planItem && <SpotifyTrackPicker initialQuery={item.title} onClose={() => setTrackPickerOpen(false)} onSelect={async (track) => { const artwork = await cacheCoverAsset(track.artworkUrl, 'spotify'); const selectedTrack = { ...track, cachedArtworkPath: artwork?.storagePath || null }; const memoryTrack = await setSpotifyTrack.mutateAsync({ planItemId: planItem.id, track: selectedTrack }); selectMusicItem(memoryTrackAsSpotifyItem(memoryTrack), true); setEditingTrack(false); setTrackPickerOpen(false); }} />}
      {showRegistrationSuccess && <OverlayNotice role="status" className="pointer-events-none inset-0 grid place-items-center bg-black/25"><div className="rounded-sm border border-white/20 bg-neutral-950/90 px-8 py-5 text-center text-white shadow-2xl backdrop-blur"><ArcadeLottie variant="success" loop={false} className="mx-auto h-24 w-24 text-emerald-300" /><p className="font-title text-sm font-bold uppercase tracking-widest">Memoria registrada</p></div></OverlayNotice>}
    </AppShell>
  );
}

function memoryTrackAsSpotifyItem(track: MemoryTrack): SavedMusicItem {
  return {
    id: `memory-track:${track.id}`, spaceId: track.spaceId, provider: 'spotify', providerId: track.externalId,
    spotifyUri: track.spotifyUri, entityType: 'track', title: track.title, artist: track.artist,
    artworkUrl: track.coverUrl, artworkStoragePath: track.cachedArtworkPath, externalUrl: track.externalUrl,
    localStoragePath: null, localUrl: null, mimeType: null, durationMs: track.durationMs,
    createdBy: track.createdBy, createdAt: track.createdAt,
  };
}
