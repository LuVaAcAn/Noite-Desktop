import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronUp, ExternalLink, Minimize2, Music2, Pause, Play, Shuffle, Volume2, VolumeX } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSpace } from '../../hooks/use-space';
import { useSavedMusic } from '../../hooks/use-music';
import { openExternal } from '../../lib/system-status';
import { spotifyEmbedUrl } from '../../lib/spotify-embed';
import { useUiStore } from '../../stores/ui-store';
import { MusicArtwork } from './MusicArtwork';
import { loadSpotifyIframeApi, SPOTIFY_IFRAME_ALLOW, type SpotifyEmbedController } from '../../lib/spotify-iframe-api';

export function GlobalMusicPlayer() {
  const navigate = useNavigate();
  const location = useLocation();
  const { space } = useSpace();
  const library = useSavedMusic(space?.id);
  const audioRef = useRef<HTMLAudioElement>(null);
  const selectedId = useUiStore((state) => state.musicSelectedId);
  const previewItem = useUiStore((state) => state.musicPreviewItem);
  const minimized = useUiStore((state) => state.musicMinimized);
  const playRequest = useUiStore((state) => state.musicPlayRequest);
  const setSelectedId = useUiStore((state) => state.setMusicSelectedId);
  const setMinimized = useUiStore((state) => state.setMusicMinimized);
  const setPlaybackState = useUiStore((state) => state.setMusicPlaybackState);
  const [playing, setPlaying] = useState(false);
  const [spotifyPlaying, setSpotifyPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [error, setError] = useState<string | null>(null);
  const [embedLoading, setEmbedLoading] = useState(false);
  const handledPlayRequest = useRef(0);
  const playable = useMemo(() => library.data?.filter((item) => item.provider === 'spotify' || Boolean(item.localUrl)) ?? [], [library.data]);

  useEffect(() => {
    if (previewItem?.id === selectedId || (selectedId && playable.some((item) => item.id === selectedId))) return;
    if (playable.length) setSelectedId(playable[Math.floor(Math.random() * playable.length)].id);
    else if (!library.isLoading) setSelectedId(null);
  }, [library.isLoading, playable, previewItem, selectedId, setSelectedId]);

  const selected = previewItem?.id === selectedId ? previewItem : playable.find((item) => item.id === selectedId) ?? null;
  const embedUrl = selected?.provider === 'spotify' ? spotifyEmbedUrl(selected) : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.load(); audio.volume = volume; }
    setPlaying(false);
    setSpotifyPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    setPlaybackState('idle');
    setEmbedLoading(Boolean(embedUrl));
  // The selected source owns reset/load; volume updates are handled separately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl, selectedId]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

  useEffect(() => {
    if (playRequest === 0 || playRequest === handledPlayRequest.current || selected?.provider !== 'local') return;
    handledPlayRequest.current = playRequest;
    const audio = audioRef.current;
    if (!audio) return;
    let active = true;
    setError(null);
    void audio.play().then(() => {
      if (active) { setPlaying(true); setPlaybackState('playing'); }
    }).catch((cause: unknown) => {
      if (!active) return;
      setPlaying(false);
      if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
        setPlaybackState('blocked');
        setError('Pulsa reproducir para escuchar la canción.');
      } else {
        setPlaybackState('unsupported');
        setError('Tu archivo no es compatible con Noite. Importa un MP3, M4A, WAV u OGG compatible.');
      }
    });
    return () => { active = false; };
  }, [playRequest, selected?.id, selected?.localUrl, selected?.provider, setPlaybackState]);

  useEffect(() => {
    if (location.pathname !== '/bienvenida') return;
    audioRef.current?.pause();
    setPlaying(false);
  }, [location.pathname]);

  function shuffle() {
    const candidates = playable.filter((item) => item.id !== selected?.id);
    const next = candidates[Math.floor(Math.random() * candidates.length)] ?? playable[0] ?? null;
    if (next) setSelectedId(next.id);
  }

  async function toggleLocal() {
    const audio = audioRef.current;
    if (!audio) return;
    setError(null);
    try {
      if (audio.paused) {
        await audio.play();
        setPlaying(true);
        setPlaybackState('playing');
      } else {
        audio.pause();
        setPlaying(false);
        setPlaybackState('idle');
      }
    } catch (cause) {
      setPlaying(false);
      if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
        setPlaybackState('blocked');
        setError('Pulsa reproducir para escuchar la canción.');
      } else {
        setPlaybackState('unsupported');
        setError('Tu archivo no es compatible con Noite. Importa un MP3, M4A, WAV u OGG compatible.');
      }
    }
  }

  function explainSystemVolume() {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Spotify usa el volumen del sistema. Ajústalo desde el icono de sonido de Windows.' }));
  }

  const playerClass = minimized
    ? 'h-14 w-14 rounded-full p-0'
    : `w-[min(390px,calc(100vw-8rem))] rounded-[18px] ${selected?.provider === 'spotify' ? 'p-2.5' : 'p-3'}`;

  if (location.pathname === '/bienvenida') return null;
  if (!selected) return <button data-global-music-player onClick={() => navigate('/musica')} className="layer-floating fixed bottom-11 left-[var(--shell-gutter)] flex h-14 items-center gap-2 rounded-full border border-noche-border bg-noche-surface px-4 text-sm font-semibold text-noche-text shadow-card"><Music2 size={18} /> Agregar música</button>;

  const playerTheme = selected.provider === 'spotify' ? {
    '--noche-bg': '18 18 18',
    '--noche-surface': '24 24 24',
    '--noche-surface-hover': '40 40 40',
    '--noche-border': '51 51 51',
    '--noche-text': '255 255 255',
    '--noche-muted': '179 179 179',
    '--theme-accent': '30 215 96',
    colorScheme: 'dark',
  } as CSSProperties : undefined;

  return <section style={playerTheme} data-global-music-player data-expanded={minimized ? 'false' : 'true'} data-provider={selected.provider} aria-label="Reproductor de música" className={`layer-floating fixed bottom-11 left-[var(--shell-gutter)] max-h-[calc(100dvh-7rem)] overflow-auto border border-noche-border bg-noche-surface/95 text-noche-text shadow-2xl backdrop-blur-xl ${playerClass}`}>
    {minimized && <button aria-label={`Expandir reproductor: ${selected.title}`} onClick={() => setMinimized(false)} className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-full"><MusicArtwork src={selected.artworkUrl} alt="" /><span className="absolute inset-0 grid place-items-center bg-black/35 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><ChevronUp size={19} /></span></button>}

    {!minimized && <div className="flex items-center gap-3">
      {selected.provider === 'local' ? <button aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={() => void toggleLocal()} className="group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-noche-bg"><MusicArtwork src={selected.artworkUrl} alt="" /><span className="absolute inset-0 grid place-items-center bg-black/35 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">{playing ? <Pause size={18} /> : <Play size={18} />}</span></button> : <button aria-label={spotifyPlaying ? 'Pausar Spotify' : 'Reproducir Spotify'} onClick={() => useUiStore.getState().selectMusicItem(selected)} className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-noche-bg"><MusicArtwork src={selected.artworkUrl} alt="" /><span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">{spotifyPlaying ? <Pause size={17} /> : <Play size={17} />}</span></button>}
      <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{selected.title}</p><p className="truncate text-[10px] text-noche-muted">{selected.provider === 'local' ? (playing ? 'Reproduciendo en Noite' : 'Audio local') : `Spotify · ${selected.entityType}`}</p></div>
      <button aria-label="Elegir otra música al azar" onClick={shuffle} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-noche-muted hover:bg-noche-bg hover:text-noche-text"><Shuffle size={16} /></button>
      <button aria-label="Minimizar reproductor" onClick={() => setMinimized(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-noche-muted hover:bg-noche-bg hover:text-noche-text"><Minimize2 size={16} /></button>
    </div>}

    {!minimized && selected.provider === 'local' && <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_70px] items-center gap-2"><input aria-label="Progreso" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(event) => { const next = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = next; setCurrentTime(next); }} className="w-full accent-[rgb(var(--theme-accent))]" /><button type="button" aria-label={volume === 0 ? 'Activar volumen' : 'Silenciar'} onClick={() => setVolume((current) => current === 0 ? 0.7 : 0)} className="text-noche-muted hover:text-noche-text">{volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><input aria-label="Volumen" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); if (audioRef.current) audioRef.current.volume = next; }} className="w-full accent-[rgb(var(--theme-accent))]" /></div>}

    {selected.provider === 'spotify' && <div aria-hidden={minimized || undefined} className={minimized ? 'pointer-events-none absolute bottom-0 left-0 h-px w-px overflow-hidden opacity-0' : 'relative mt-2 min-h-[152px] overflow-hidden rounded-xl bg-[#121212]'}>{!minimized && embedLoading && <div className="absolute inset-0 z-10 grid place-items-center text-xs text-[#b3b3b3]">Cargando Spotify…</div>}{embedUrl ? <SpotifyController key={embedUrl} uri={spotifyUri(selected)} fallbackUrl={embedUrl} playRequest={playRequest} playing={spotifyPlaying} onReady={() => setEmbedLoading(false)} onPlaybackChange={(value) => { setSpotifyPlaying(value); if (value) setPlaybackState('playing'); }} onBlocked={() => { setPlaybackState('blocked'); setError('Pulsa reproducir para escuchar la canción.'); }} /> : <p className="p-4 text-xs text-[#b3b3b3]">Este enlace no contiene una identidad de Spotify válida.</p>}</div>}

    {!minimized && error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    {!minimized && selected.provider === 'spotify' && <div className="mt-2 flex items-center justify-between"><button onClick={() => void openExternal(selected.externalUrl ?? '')} className="inline-flex items-center gap-1 text-xs font-bold text-[#1ed760]">Abrir en Spotify <ExternalLink size={12} /></button><button type="button" aria-label="Volumen de Spotify" title="Spotify usa el mezclador de volumen de Windows" onClick={explainSystemVolume} className="rounded-full p-2 text-noche-muted hover:bg-noche-bg hover:text-noche-text"><Volume2 size={17} /></button></div>}
    {selected.provider === 'local' && selected.localUrl && <audio ref={audioRef} src={selected.localUrl} preload="metadata" onEnded={() => { setPlaying(false); setPlaybackState('idle'); shuffle(); }} onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration || 0); event.currentTarget.volume = volume; }} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPause={() => setPlaying(false)} onPlay={() => { setPlaying(true); setPlaybackState('playing'); }} onError={(event) => { const mediaError = event.currentTarget.error; if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) { setPlaybackState('unsupported'); setError('Tu archivo no es compatible con Noite. Importa un MP3, M4A, WAV u OGG compatible.'); } else { setPlaybackState('missing'); setError('Noite no encuentra este archivo. Vuelve a importarlo desde Música.'); } }} />}
  </section>;
}

function spotifyUri(item: { spotifyUri: string | null; entityType: string; providerId: string | null; externalUrl: string | null }) {
  if (item.spotifyUri) return item.spotifyUri;
  if (item.providerId) return `spotify:${item.entityType}:${item.providerId}`;
  const match = item.externalUrl?.match(/open\.spotify\.com\/(?:intl-[^/]+\/)?(track|album|playlist|artist|show|episode)\/([^?]+)/);
  return match ? `spotify:${match[1]}:${match[2]}` : item.externalUrl ?? '';
}

function SpotifyController({ uri, fallbackUrl, playRequest, playing, onReady, onPlaybackChange, onBlocked }: { uri: string; fallbackUrl: string; playRequest: number; playing: boolean; onReady: () => void; onPlaybackChange: (playing: boolean) => void; onBlocked: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const lastRequest = useRef(0);
  const observedPlayback = useRef(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!hostRef.current || !uri) return;
    void loadSpotifyIframeApi().then((api) => {
      if (cancelled || !hostRef.current) return;
      api.createController(hostRef.current, { uri, width: '100%', height: 152 }, (controller) => {
        if (cancelled) { controller.destroy(); return; }
        controllerRef.current = controller;
        controller.addListener('ready', onReady);
        controller.addListener('playback_update', (event) => { const isPlaying = event.data?.isPaused === false; if (isPlaying) observedPlayback.current = true; onPlaybackChange(isPlaying); });
        onReady();
        if (playRequest > 0) { lastRequest.current = playRequest; observedPlayback.current = false; try { controller.play(); window.setTimeout(() => { if (!cancelled && !observedPlayback.current) onBlocked(); }, 1_500); } catch { onBlocked(); } }
      });
    }).catch(() => { if (!cancelled) { setFallback(true); onReady(); } });
    return () => { cancelled = true; controllerRef.current?.destroy(); controllerRef.current = null; };
  // Controller lifetime is owned by the Spotify URI.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  useEffect(() => {
    if (!controllerRef.current || playRequest === 0 || playRequest === lastRequest.current) return;
    lastRequest.current = playRequest;
    observedPlayback.current = false;
    try { controllerRef.current.togglePlay(); if (!playing) window.setTimeout(() => { if (!observedPlayback.current) onBlocked(); }, 1_500); } catch { onBlocked(); }
  }, [onBlocked, playRequest, playing]);

  if (fallback) return <iframe title="Spotify" src={fallbackUrl} width="100%" height="152" allow={SPOTIFY_IFRAME_ALLOW} loading="eager" className="block border-0" />;
  return <div ref={hostRef} className="relative h-[152px] w-full" />;
}
