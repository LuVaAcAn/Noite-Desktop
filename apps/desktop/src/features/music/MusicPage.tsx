import { useMemo, useRef, useState } from 'react';
import { ExternalLink, Link2, Pencil, Play, Save, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import type { SavedMusicItem } from '@proyecto-noche/domain';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
import { Button } from '../../components/ui/Button';
import { MusicArtwork } from '../../components/ui/MusicArtwork';
import { useSpace } from '../../hooks/use-space';
import { useRemoveSavedMusic, useRenameSavedMusic, useSavedMusic, useSaveMusic, useSpotifyLinkPreview } from '../../hooks/use-music';
import { spotifyLinkService } from '../../lib/repositories';
import { openExternal } from '../../lib/system-status';
import { importLocalAudio } from '../../lib/native-media';
import { cacheCoverAsset } from '../../lib/cache-cover';
import { useUiStore } from '../../stores/ui-store';
import spotifyLogo from '../../assets/spotify-full-logo-white.svg';
import { Modal } from '../../components/ui/Overlay';

export function MusicPage() {
  const { space } = useSpace();
  const library = useSavedMusic(space?.id);
  const saveMusic = useSaveMusic();
  const removeMusic = useRemoveSavedMusic(space?.id);
  const renameMusic = useRenameSavedMusic(space?.id);
  const preview = useSpotifyLinkPreview();
  const selectMusicItem = useUiStore((state) => state.selectMusicItem);
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [renameDraft, setRenameDraft] = useState<{ id: string; title: string } | null>(null);

  const alreadySaved = Boolean(preview.data && library.data?.some((item) => item.provider === 'spotify' && (
    (preview.data.spotifyId && item.providerId === preview.data.spotifyId)
    || item.externalUrl === preview.data.normalizedUrl
  )));

  const previewItem = useMemo<SavedMusicItem | null>(() => preview.data && space ? {
    id: `spotify-preview:${preview.data.spotifyId ?? preview.data.normalizedUrl}`,
    spaceId: space.id,
    provider: 'spotify',
    providerId: preview.data.spotifyId,
    spotifyUri: preview.data.spotifyUri,
    entityType: preview.data.entityType,
    title: preview.data.title,
    artist: null,
    artworkUrl: preview.data.thumbnailUrl,
    artworkStoragePath: null,
    externalUrl: preview.data.normalizedUrl,
    localStoragePath: null,
    localUrl: null,
    mimeType: null,
    durationMs: null,
    createdBy: 'preview',
    createdAt: new Date(0).toISOString(),
  } : null, [preview.data, space]);

  async function saveSpotify() {
    if (!space || !preview.data || alreadySaved) return;
    setMessage(null);
    try {
      const artwork = await cacheCoverAsset(preview.data.thumbnailUrl, 'spotify');
      await saveMusic.mutateAsync({
        spaceId: space.id,
        provider: 'spotify',
        providerId: preview.data.spotifyId,
        spotifyUri: preview.data.spotifyUri,
        entityType: preview.data.entityType,
        title: preview.data.title,
        artworkUrl: preview.data.thumbnailUrl,
        artworkStoragePath: artwork?.storagePath || null,
        externalUrl: preview.data.normalizedUrl,
      });
      setMessage('Guardado en la biblioteca de Noite.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo guardar esta música.');
    }
  }

  async function importAudio(file: File | undefined) {
    if (!file || !space) return;
    setImporting(true);
    setMessage(null);
    try {
      const media = await importLocalAudio(file);
      await saveMusic.mutateAsync({ spaceId: space.id, provider: 'local', spotifyUri: null, entityType: 'audio', title: file.name.replace(/\.[^.]+$/, ''), localStoragePath: media.storagePath, localUrl: media.resolvedUrl, mimeType: media.mimeType });
      setMessage('Audio local guardado en Noite.');
    } catch (cause) {
      const nativeMessage = typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : null;
      setMessage(nativeMessage ?? (cause instanceof Error ? cause.message : 'Tu archivo no es compatible con Noite. Importa un MP3, M4A, WAV u OGG compatible.'));
    } finally {
      setImporting(false);
    }
  }

  async function removeItem(item: SavedMusicItem) {
    const detail = item.provider === 'local' ? ' También se eliminará la copia local que Noite importó.' : '';
    if (!window.confirm(`¿Eliminar “${item.title}” de Música guardada?${detail}`)) return;
    await removeMusic.mutateAsync(item.id);
  }

  return <AppShell navigation activeSection="musica">
    <main className="app-content-grid grid h-full min-h-0 grid-cols-1 grid-rows-2 gap-4 overflow-hidden px-[var(--shell-gutter)] py-[var(--content-pad-y)] text-noche-text md:grid-cols-[minmax(280px,.82fr)_minmax(0,1.18fr)] md:grid-rows-1 md:gap-5">
      <ScrollRegion as="section" label="Añadir música" className="pr-2 pb-[var(--floating-controls-clearance)]">
        <div className="rounded-[14px] bg-noche-surface p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="font-wordmark text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Música en Noite</p><h1 className="mt-2 text-3xl font-bold">Tu biblioteca musical</h1></div><img src={spotifyLogo} alt="Spotify" className="h-auto w-28 shrink-0 rounded-lg bg-[#121212] p-2" /></div>
          <p className="mt-4 max-w-lg text-sm leading-6 text-noche-muted">Pega cualquier enlace compatible de Spotify, revisa su vista previa y guárdalo para escucharlo desde Noite.</p>
          <form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); if (link.trim()) preview.mutate(link.trim()); }}>
            <label className="block text-xs font-bold uppercase tracking-wide text-noche-muted">Enlace o URI de Spotify<input data-controller-skip value={link} onChange={(event) => { setLink(event.target.value); preview.reset(); setMessage(null); }} placeholder="https://open.spotify.com/track/…" className="mt-2 h-12 w-full rounded-[11px] border border-noche-border bg-noche-bg px-4 text-sm text-noche-text outline-none transition focus:border-[#1ed760]" /></label>
            <Button type="submit" disabled={!link.trim() || preview.isPending} className="!bg-[#1ed760] !bg-none !text-black hover:!bg-[#1fdf64]"><Link2 size={16} />{preview.isPending ? 'Consultando…' : 'Ver vista previa'}</Button>
          </form>
          {preview.isError && <div role="alert" className="mt-4 rounded-[11px] border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-100">{preview.error.message}</div>}
        </div>

        {preview.data && previewItem && <article className="mt-4 overflow-hidden rounded-[14px] bg-noche-surface p-4"><div className="flex gap-4"><div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-noche-surface-hover"><MusicArtwork src={preview.data.thumbnailUrl} alt={`Portada de ${preview.data.title}`} className="h-full w-full object-contain" iconClassName="text-noche-muted" /></div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{preview.data.entityType}</p><h2 className="mt-2 line-clamp-2 text-xl font-bold">{preview.data.title}</h2><div className="mt-4 flex flex-wrap gap-2"><Button className="!bg-white !bg-none !text-black" onClick={() => selectMusicItem(previewItem, true)}><Play size={15} /> Reproducir</Button><Button variant="secondary" onClick={() => void saveSpotify()} disabled={saveMusic.isPending || alreadySaved}><Save size={15} /> {alreadySaved ? 'Ya guardado' : saveMusic.isPending ? 'Guardando…' : 'Guardar en Noite'}</Button><Button variant="ghost" onClick={() => spotifyLinkService.open(preview.data!)}><ExternalLink size={15} /> Spotify</Button></div></div></div></article>}

        <div className="mt-4 rounded-[14px] border border-noche-border bg-noche-surface p-5">
          <h2 className="font-semibold">Tu propio audio</h2><p className="mt-1 text-sm text-noche-muted">Importa MP3, M4A/AAC, WAV u OGG. El archivo se copia a los datos locales de Noite.</p>
          <Button className="mt-4" variant="secondary" disabled={importing} onClick={() => fileRef.current?.click()}><Upload size={16} />{importing ? 'Importando…' : 'Importar audio'}</Button>
          <input ref={fileRef} type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg" className="hidden" onChange={(event) => { void importAudio(event.target.files?.[0]); event.target.value = ''; }} />
        </div>
        <div className="mt-4 flex gap-3 rounded-[14px] border border-noche-border bg-noche-surface p-4 text-xs leading-5 text-noche-muted"><ShieldCheck size={19} className="shrink-0 text-emerald-700" /><p>Los reproductores incrustados se cargan directamente desde Spotify y están sujetos a sus condiciones y privacidad. Noite no guarda tu cuenta de Spotify.</p></div>
        {message && <p role="status" className="mt-3 rounded-[11px] bg-white/10 p-3 text-sm">{message}</p>}
      </ScrollRegion>

      <ScrollRegion as="section" label="Música guardada" className="pl-2 pb-[var(--floating-controls-clearance)]">
        <div className="mb-4 pb-1"><p className="font-wordmark text-xs font-bold uppercase tracking-[.16em] text-emerald-700">Biblioteca local</p><h2 className="mt-1 text-2xl font-bold">Música guardada</h2></div>
        {library.isLoading && <p className="p-5 text-sm text-noche-muted">Cargando música…</p>}
        {library.data?.length === 0 && <div className="rounded-[14px] border border-dashed border-noche-border p-10 text-center"><MusicArtwork /><p className="mt-3 font-semibold">Todavía no guardaste música</p><p className="mt-1 text-sm text-noche-muted">Guarda un enlace de Spotify o importa un archivo local.</p></div>}
        <div className="grid gap-3 sm:grid-cols-2">{library.data?.map((item) => <article key={item.id} className="group min-w-0 rounded-[14px] bg-noche-surface p-3 transition hover:bg-noche-surface-hover"><div className="flex items-center gap-3"><button aria-label={`Reproducir ${item.title}`} onClick={() => selectMusicItem(item)} className="group/art relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-noche-surface-hover"><MusicArtwork src={item.artworkUrl} alt="" iconClassName="text-noche-muted" /><span className="absolute inset-0 grid place-items-center bg-black/35 text-white opacity-0 transition group-hover/art:opacity-100 group-focus-visible/art:opacity-100"><Play size={18} /></span></button><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.title}</p><p className="truncate text-xs capitalize text-noche-muted">{item.provider === 'spotify' ? item.entityType : 'Audio local'}</p></div>{item.provider === 'local' && <button aria-label={`Renombrar ${item.title}`} onClick={() => setRenameDraft({ id: item.id, title: item.title })} className="rounded-full p-2 text-noche-muted hover:bg-white/10 hover:text-noche-text"><Pencil size={14} /></button>}<button aria-label={`Eliminar ${item.title}`} onClick={() => void removeItem(item)} className="rounded-full p-2 text-noche-muted hover:bg-white/10 hover:text-red-300"><Trash2 size={15} /></button></div><button onClick={() => selectMusicItem(item)} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><Play size={12} /> Reproducir en Noite</button>{item.provider === 'spotify' && <button onClick={() => void openExternal(item.externalUrl ?? '')} className="ml-3 mt-3 inline-flex items-center gap-1 text-xs font-bold text-noche-muted">Abrir <ExternalLink size={12} /></button>}</article>)}</div>
      </ScrollRegion>
    </main>
    {renameDraft && <Modal labelledBy="rename-audio-title" className="grid place-items-center bg-black/75 p-4" onClose={() => setRenameDraft(null)}><form className="w-full max-w-md rounded-2xl border border-noche-border bg-noche-surface p-6 shadow-2xl" onSubmit={async (event) => { event.preventDefault(); const title = renameDraft.title.trim(); if (!title) return; await renameMusic.mutateAsync({ id: renameDraft.id, title }); setRenameDraft(null); }}><div className="flex items-center justify-between gap-4"><h2 id="rename-audio-title" className="text-lg font-semibold text-noche-text">Renombrar audio</h2><button type="button" data-dialog-close aria-label="Cerrar" onClick={() => setRenameDraft(null)} className="rounded-full p-2 text-noche-muted hover:bg-noche-bg"><X size={18} /></button></div><label className="mt-4 block text-sm text-noche-muted">Nombre<input autoFocus value={renameDraft.title} maxLength={120} onChange={(event) => setRenameDraft({ ...renameDraft, title: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-noche-border bg-noche-bg px-3 text-noche-text outline-none focus:border-[#1ed760]" /></label><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRenameDraft(null)}>Cancelar</Button><Button type="submit" disabled={!renameDraft.title.trim() || renameMusic.isPending}>Guardar</Button></div></form></Modal>}
  </AppShell>;
}
