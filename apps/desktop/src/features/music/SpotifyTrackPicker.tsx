import { useState } from 'react';
import { ExternalLink, Link2, X } from 'lucide-react';
import type { SpotifyTrack } from '@proyecto-noche/domain';
import { Button } from '../../components/ui/Button';
import { useSpotifyLinkPreview } from '../../hooks/use-music';
import { spotifyLinkService } from '../../lib/repositories';
import spotifyLogo from '../../assets/spotify-full-logo-white.svg';
import { MusicArtwork } from '../../components/ui/MusicArtwork';
import { Modal } from '../../components/ui/Overlay';

export function SpotifyTrackPicker({ onClose, onSelect }: { initialQuery?: string; onClose(): void; onSelect(track: SpotifyTrack): void | Promise<void> }) {
  const preview = useSpotifyLinkPreview();
  const [link, setLink] = useState('');
  const track: SpotifyTrack | null = preview.data ? {
    id: preview.data.spotifyId ?? preview.data.normalizedUrl,
    uri: preview.data.spotifyUri ?? preview.data.normalizedUrl,
    title: preview.data.title,
    artist: null,
    album: null,
    durationMs: null,
    artworkUrl: preview.data.thumbnailUrl,
    externalUrl: preview.data.normalizedUrl,
  } : null;

  return <Modal ariaLabel="Añadir enlace de Spotify" data-controller-scope="dialog" className="flex items-center justify-center bg-black/65 p-5 backdrop-blur-sm" closeOnBackdrop onClose={onClose}>
    <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[14px] bg-[#181818] text-white ring-1 ring-white/10">
      <header className="flex items-center gap-3 border-b border-[#333] p-4"><img src={spotifyLogo} alt="Spotify" className="h-auto w-24" /><div className="flex-1" /><button aria-label="Cerrar" onClick={onClose} className="rounded-full p-2 text-[#b3b3b3] hover:bg-[#282828] hover:text-white"><X size={18} /></button></header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
        <p className="text-sm text-[#b3b3b3]">Pega un enlace oficial de Spotify. No necesitas conectar una cuenta.</p>
        <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (link.trim()) preview.mutate(link.trim()); }}><input data-controller-skip value={link} onChange={(event) => { setLink(event.target.value); preview.reset(); }} placeholder="https://open.spotify.com/track/…" className="h-11 min-w-0 flex-1 rounded-[11px] border border-[#404040] bg-[#242424] px-4 text-sm outline-none focus:border-[#1ed760]" /><Button type="submit" size="sm" disabled={!link.trim() || preview.isPending} className="!bg-[#1ed760] !bg-none !text-black"><Link2 size={14} />{preview.isPending ? 'Consultando…' : 'Previsualizar'}</Button></form>
        {preview.isError && <p role="alert" className="mt-4 rounded-[11px] bg-red-950/50 p-3 text-sm text-red-100">{preview.error.message}</p>}
        {preview.data && track && <article className="mt-4 flex items-center gap-4 rounded-[14px] bg-[#242424] p-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-[#121212]"><MusicArtwork src={preview.data.thumbnailUrl} alt={`Portada de ${preview.data.title}`} className="h-full w-full object-contain" iconClassName="text-[#b3b3b3]" /></div><div className="min-w-0 flex-1"><p className="line-clamp-2 font-bold">{preview.data.title}</p><p className="mt-1 text-xs capitalize text-[#b3b3b3]">{preview.data.entityType}</p><button type="button" onClick={() => spotifyLinkService.open(preview.data!)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#1ed760]">Abrir en Spotify <ExternalLink size={12} /></button></div><Button size="sm" onClick={() => void onSelect(track)} className="!bg-white !bg-none !text-black">Elegir</Button></article>}
      </div>
    </div>
  </Modal>;
}
