import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Globe, Paperclip, Shapes, X } from 'lucide-react';
import type { CoverSearchResult, LibraryItemKind, MemoryTrack, SavedMusicItem, SpotifyTrack } from '@proyecto-noche/domain';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
import { Button } from '../../components/ui/Button';
import { StarRating } from '../../components/ui/StarRating';
import { useRegisterActivity } from '../../hooks/use-register-activity';
import { useSettings } from '../../hooks/use-settings';
import { CoverSearchModal } from './CoverSearchModal';
import { gradientFor } from '../../lib/placeholder-gradient';
import { cacheCoverAsset } from '../../lib/cache-cover';
import { SpotifyTrackPicker } from '../music/SpotifyTrackPicker';
import { activityTypeForSection } from './new-activity-route';
import { Modal } from '../../components/ui/Overlay';
import { useSavedMusic } from '../../hooks/use-music';
import { useSpace } from '../../hooks/use-space';
import { musicLibraryRepository } from '../../lib/repositories';
import { useUiStore } from '../../stores/ui-store';
import { MusicArtwork } from '../../components/ui/MusicArtwork';

const KIND_OPTIONS: { value: LibraryItemKind; label: string }[] = [
  { value: 'movie', label: 'Película' },
  { value: 'series', label: 'Serie' },
  { value: 'video_game', label: 'Videojuego' },
  { value: 'creative_activity', label: 'Actividad creativa' },
  { value: 'reading', label: 'Lectura' },
  { value: 'other', label: 'Otro' },
];

const CUSTOM_PREFIX = 'custom:';

export function AddActivityForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromPlan = searchParams.get('from') === 'plan';
  const sourceSection = searchParams.get('section');
  const registerActivity = useRegisterActivity();
  const { space } = useSpace();
  const savedMusic = useSavedMusic(space?.id);
  const selectMusicItem = useUiStore((state) => state.selectMusicItem);
  const { data: settings } = useSettings();

  const [title, setTitle] = useState('');
  const [typeValue, setTypeValue] = useState<string>(() => activityTypeForSection(sourceSection, []));
  const typeTouched = useRef(false);
  const [mode, setMode] = useState<'later' | 'memory'>(() => fromPlan ? 'later' : 'memory');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [songLink, setSongLink] = useState('');
  const [spotifyTrack, setSpotifyTrack] = useState<SpotifyTrack | null>(null);
  const [savedMusicId, setSavedMusicId] = useState('');
  const [songPickerOpen, setSongPickerOpen] = useState(false);
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const [ideaBy, setIdeaBy] = useState('');
  const [cover, setCover] = useState<
    { source: 'upload'; dataUrl: string } | { source: 'search'; result: CoverSearchResult } | null
  >(null);
  const [coverPath, setCoverPath] = useState<string | undefined>();
  const [coverSearchOpen, setCoverSearchOpen] = useState(false);
  const [categoryPrompt, setCategoryPrompt] = useState<'initial' | 'cover' | null>(() => sourceSection ? null : 'initial');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!typeTouched.current && settings) setTypeValue(activityTypeForSection(sourceSection, settings.customCategories));
  }, [settings, sourceSection]);

  const isCustomType = typeValue.startsWith(CUSTOM_PREFIX);
  const kind: LibraryItemKind = !typeValue ? 'other' : isCustomType ? 'custom' : (typeValue as LibraryItemKind);
  const customCategoryId = isCustomType ? typeValue.slice(CUSTOM_PREFIX.length) : undefined;

  function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setError('La imagen supera los 3 MB permitidos');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const asset = await cacheCoverAsset(reader.result as string);
      setCover({ source: 'upload', dataUrl: asset?.resolvedUrl ?? (reader.result as string) });
      setCoverPath(asset?.storagePath || undefined);
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!typeValue) {
      setError('Elige un tipo de actividad.');
      return;
    }
    try {
      const result = await registerActivity.mutateAsync({
        title: title.trim(),
        kind,
        customCategoryId,
        mode,
        rating: rating > 0 ? rating : undefined,
        comment: comment.trim() || undefined,
        song: songLink.trim() || undefined,
        spotifyTrack: spotifyTrack ?? undefined,
        ideaBy: ideaBy || undefined,
        coverUrl: cover?.source === 'upload' ? cover.dataUrl : cover?.result.coverUrl ?? undefined,
        customCoverPath: coverPath,
        externalProvider: cover?.source === 'search' ? cover.result.externalProvider : undefined,
        externalId: cover?.source === 'search' ? cover.result.externalId : undefined,
      });
      if (result.planItem && savedMusicId) {
        await musicLibraryRepository.attach(result.planItem.id, savedMusicId);
        const selectedMusic = savedMusic.data?.find((entry) => entry.id === savedMusicId);
        if (selectedMusic) selectMusicItem(selectedMusic);
      } else if (result.track?.provider === 'spotify') {
        selectMusicItem(memoryTrackAsSpotifyItem(result.track), true);
      }
      navigate(fromPlan ? `/calendario?item=${encodeURIComponent(result.item.id)}` : `/biblioteca/item/${result.item.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la actividad');
    }
  }

  return (
    <AppShell showBack>
      <ScrollRegion label="Registrar actividad" className="app-route-content px-[var(--shell-gutter)] pb-5">
        <h1 className="mb-4 font-display text-2xl font-bold text-noche-text">Registrar actividad</h1>

        <div className="mb-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Qué quieres registrar">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'later'}
            onClick={() => setMode('later')}
            className={`rounded-[14px] border p-4 text-left transition duration-150 active:scale-[.99] ${mode === 'later' ? 'border-[rgb(var(--theme-accent))] bg-[rgb(var(--theme-accent)/.14)]' : 'border-noche-border bg-noche-surface'}`}
          >
            <span className="block font-semibold text-noche-text">Guardar para después</span>
            <span className="text-sm text-noche-muted">Una idea pendiente para elegir o planear luego.</span>
          </button>
          {!fromPlan && <button
            type="button"
            role="radio"
            aria-checked={mode === 'memory'}
            onClick={() => setMode('memory')}
            className={`rounded-[14px] border p-4 text-left transition duration-150 active:scale-[.99] ${mode === 'memory' ? 'border-[rgb(var(--theme-accent))] bg-[rgb(var(--theme-accent)/.14)]' : 'border-noche-border bg-noche-surface'}`}
          >
            <span className="block font-semibold text-noche-text">Registrar un recuerdo</span>
            <span className="text-sm text-noche-muted">Algo que ya hicieron y quieren valorar.</span>
          </button>}
        </div>

        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <div className="flex aspect-[2/3] items-center justify-center overflow-hidden rounded-[14px] border border-noche-border bg-noche-surface">
              {cover?.source === 'upload' && (
                <img src={cover.dataUrl} alt="Portada seleccionada" className="h-full w-full object-cover" />
              )}
              {cover?.source === 'search' && cover.result.coverUrl && (
                <img src={cover.result.coverUrl} alt={cover.result.title} className="h-full w-full object-cover" />
              )}
              {cover?.source === 'search' && !cover.result.coverUrl && (
                <div
                  className={`flex h-full w-full items-center justify-center bg-gradient-to-br p-6 text-center text-sm font-semibold text-white ${gradientFor(cover.result.title)}`}
                >
                  {cover.result.title}
                </div>
              )}
              {!cover && <span className="px-6 text-center text-sm text-noche-muted">La portada aparecerá aquí</span>}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-noche-muted">Nombre</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nombre de la actividad"
                className="w-full rounded-xl border border-noche-border bg-noche-surface px-4 py-3 text-noche-text placeholder:text-noche-muted focus:border-pink-500"
              />
              <div className="mt-2 flex gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[11px] border border-noche-border bg-noche-surface px-4 py-2 text-xs font-medium text-noche-text hover:bg-noche-surface-hover">
                  <Paperclip size={14} /> Adjuntar portada (max 3 MB)
                  <input type="file" accept="image/*" className="hidden" onChange={handleCoverFile} />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!typeValue) setCategoryPrompt('cover');
                    else setCoverSearchOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-[11px] bg-noche-text px-4 py-2 text-xs font-semibold text-noche-bg transition active:scale-[.98] hover:brightness-90"
                >
                  <Globe size={14} /> Buscar portada automáticamente
                </button>
              </div>
            </div>

            <div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-noche-muted">Tipo de actividad</label>
                <select
                  value={typeValue}
                  onChange={(e) => { typeTouched.current = true; setTypeValue(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-noche-border bg-noche-surface px-4 py-3 text-noche-text focus:border-pink-500"
                >
                  <option value="">Selecciona un tipo</option>
                  {KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  {settings && settings.customCategories.length > 0 && (
                    <optgroup label="Tus categorías">
                      {settings.customCategories.map((category) => (
                        <option key={category.id} value={`${CUSTOM_PREFIX}${category.id}`}>
                          {category.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>

            {settings && (settings.userName || settings.partnerName) && (
              <div>
                <label htmlFor="idea-by" className="mb-1.5 block text-sm font-medium text-noche-muted">Idea de:</label>
                <select
                  id="idea-by"
                  value={ideaBy}
                  onChange={(e) => setIdeaBy(e.target.value)}
                  className="w-full rounded-xl border border-noche-border bg-noche-surface px-4 py-3 text-noche-text focus:border-pink-500"
                >
                  <option value="">Sin especificar</option>
                  {settings.userName && <option value={settings.userName}>{settings.userName}</option>}
                  {settings.partnerName && <option value={settings.partnerName}>{settings.partnerName}</option>}
                  {settings.userName && settings.partnerName && <option value="Ambos">Ambos</option>}
                </select>
              </div>
            )}

            {mode === 'memory' && <div>
              <label className="mb-1.5 block text-sm font-medium text-noche-muted">Calificación</label>
              <StarRating value={rating} onChange={setRating} />
            </div>}

            {mode === 'memory' && <div>
              <label className="mb-1.5 block text-sm font-medium text-noche-muted">Comentario</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="¿Qué opinan de esta actividad?"
                rows={4}
                className="w-full resize-none rounded-xl border border-noche-border bg-noche-surface px-4 py-3 text-noche-text placeholder:text-noche-muted focus:border-pink-500"
              />
            </div>}

            {mode === 'memory' && <div>
              <label className="mb-1.5 block text-sm font-medium text-noche-muted">
                ¿A qué canción les recuerda?
              </label>
              <button type="button" onClick={() => setSongPickerOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-noche-border bg-noche-surface p-3 text-left transition hover:border-[rgb(var(--theme-accent))]">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-noche-bg">{savedMusicId ? <MusicArtwork src={savedMusic.data?.find((item) => item.id === savedMusicId)?.artworkUrl} /> : spotifyTrack ? <MusicArtwork src={spotifyTrack.artworkUrl} /> : <MusicArtwork />}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-noche-text">{savedMusic.data?.find((item) => item.id === savedMusicId)?.title ?? spotifyTrack?.title ?? (songLink.trim() || 'Elegir una canción')}</span><span className="text-xs text-noche-muted">{savedMusicId ? 'Música guardada' : spotifyTrack ? 'Spotify' : songLink.trim() ? 'Asociación manual' : 'Local, Spotify o texto manual'}</span></span>
              </button>
            </div>}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end">
              <Button type="submit" disabled={registerActivity.isPending || !typeValue}>
                {registerActivity.isPending ? 'Guardando…' : mode === 'memory' ? 'Guardar recuerdo' : 'Guardar para después'}
              </Button>
            </div>
          </div>
        </form>
      </ScrollRegion>

      {coverSearchOpen && typeValue && (
        <CoverSearchModal
          initialQuery={title}
          kind={kind}
          onClose={() => setCoverSearchOpen(false)}
          onSelect={async (result) => {
            const asset = await cacheCoverAsset(result.coverUrl);
            setCoverPath(asset?.storagePath || undefined);
            setCover({ source: 'search', result });
            setCoverSearchOpen(false);
          }}
        />
      )}
      {trackPickerOpen && <SpotifyTrackPicker initialQuery={title} onClose={() => setTrackPickerOpen(false)} onSelect={async (track) => { const artwork = await cacheCoverAsset(track.artworkUrl, 'spotify'); setSpotifyTrack({ ...track, cachedArtworkPath: artwork?.storagePath || null }); setSongLink(''); setSavedMusicId(''); setTrackPickerOpen(false); }} />}
      {songPickerOpen && <Modal labelledBy="song-picker-title" className="grid place-items-center bg-black/75 p-4" onClose={() => setSongPickerOpen(false)}>
        <div className="flex max-h-[82dvh] w-full max-w-3xl flex-col rounded-2xl border border-noche-border bg-noche-surface p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[rgb(var(--theme-accent))]">Música del recuerdo</p><h2 id="song-picker-title" className="mt-1 text-xl font-semibold text-noche-text">Elige una canción</h2></div><button data-dialog-close aria-label="Cerrar selector de música" onClick={() => setSongPickerOpen(false)} className="rounded-full p-2 text-noche-muted hover:bg-noche-bg"><X size={18} /></button></div>
          <div className="mt-5 min-h-0 overflow-y-auto pr-1"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{savedMusic.data?.map((music) => <button key={music.id} type="button" onClick={() => { setSavedMusicId(music.id); setSpotifyTrack(null); setSongLink(''); setSongPickerOpen(false); }} className={`group relative overflow-hidden rounded-xl border bg-noche-bg p-2 text-left transition hover:-translate-y-0.5 hover:border-[rgb(var(--theme-accent))] ${savedMusicId === music.id ? 'border-[rgb(var(--theme-accent))] ring-2 ring-[rgb(var(--theme-accent)/.35)]' : 'border-noche-border'}`}><span className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-noche-surface"><MusicArtwork src={music.artworkUrl} alt="" /></span><span className="mt-2 block truncate text-sm font-semibold text-noche-text">{music.title}</span><span className="block text-[11px] capitalize text-noche-muted">{music.provider === 'local' ? 'Audio local' : `Spotify · ${music.entityType}`}</span>{savedMusicId === music.id && <span className="absolute right-3 top-3 rounded-full bg-[rgb(var(--theme-accent))] px-2 py-1 text-[10px] font-bold text-white">Elegida</span>}</button>)}</div>{savedMusic.data?.length === 0 && <div className="rounded-xl border border-dashed border-noche-border p-8 text-center text-sm text-noche-muted"><MusicArtwork /><p className="mt-2">Todavía no hay música guardada.</p></div>}</div>
          <div className="mt-5 border-t border-noche-border pt-4"><label className="block text-xs font-semibold text-noche-muted">Asociación manual<input value={songLink} onChange={(event) => { setSongLink(event.target.value); if (event.target.value) { setSavedMusicId(''); setSpotifyTrack(null); } }} placeholder="Nombre de una canción o enlace no reproducible" className="mt-1.5 h-11 w-full rounded-xl border border-noche-border bg-noche-bg px-3 text-noche-text outline-none focus:border-[rgb(var(--theme-accent))]" /></label><div className="mt-4 flex flex-wrap justify-between gap-2"><Button type="button" variant="ghost" onClick={() => { setSavedMusicId(''); setSpotifyTrack(null); setSongLink(''); setSongPickerOpen(false); }}>Sin canción</Button><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => { setSongPickerOpen(false); setTrackPickerOpen(true); }}>Agregar Spotify</Button><Button type="button" onClick={() => setSongPickerOpen(false)}>Listo</Button></div></div></div>
        </div>
      </Modal>}
      {categoryPrompt && settings && (
        <Modal labelledBy="activity-category-title" className="grid place-items-center bg-black/75 p-4" onClose={() => undefined}>
          <div className="w-full max-w-xl rounded-2xl border border-noche-border bg-noche-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[rgb(var(--theme-accent))]">Categoría requerida</p>
                <h2 id="activity-category-title" className="mt-1 text-xl font-semibold text-noche-text">Elige una actividad</h2>
                <p className="mt-2 text-sm leading-6 text-noche-muted">{categoryPrompt === 'cover' ? 'Elige una categoría primero para buscar una portada automáticamente.' : 'Selecciona dónde guardar esta actividad antes de completar sus datos.'}</p>
              </div>
              <Shapes className="shrink-0 text-[rgb(var(--theme-accent))]" />
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {KIND_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => { typeTouched.current = true; setTypeValue(option.value); const openCover = categoryPrompt === 'cover'; setCategoryPrompt(null); if (openCover) setCoverSearchOpen(true); }} className="rounded-xl border border-noche-border bg-noche-bg px-4 py-3 text-left text-sm font-semibold text-noche-text transition hover:border-[rgb(var(--theme-accent))] hover:bg-noche-surface-hover">{option.label}</button>)}
              {settings.customCategories.map((category) => <button key={category.id} type="button" onClick={() => { typeTouched.current = true; setTypeValue(`${CUSTOM_PREFIX}${category.id}`); const openCover = categoryPrompt === 'cover'; setCategoryPrompt(null); if (openCover) setCoverSearchOpen(true); }} className="flex items-center gap-2 rounded-xl border border-noche-border bg-noche-bg px-4 py-3 text-left text-sm font-semibold text-noche-text transition hover:border-[rgb(var(--theme-accent))] hover:bg-noche-surface-hover"><span>{category.icon}</span>{category.label}</button>)}
            </div>
            <div className="mt-5 flex justify-end"><Button type="button" variant="ghost" onClick={() => { if (categoryPrompt === 'initial') navigate(-1); else setCategoryPrompt(null); }}><X size={15} /> Cancelar</Button></div>
          </div>
        </Modal>
      )}
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
