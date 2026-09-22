import { invoke } from './invoke';
import type { SpotifyLinkPreview, SpotifyLinkService } from '@proyecto-noche/domain';
import { openExternal } from './system-status';

export class SpotifyLinkError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = 'SpotifyLinkError';
  }
}

function normalizeBrowserLink(input: string): string {
  const trimmed = input.trim();
  const uri = /^spotify:(track|album|playlist|artist|show|episode):([A-Za-z0-9]+)$/.exec(trimmed);
  if (uri) return `https://open.spotify.com/${uri[1]}/${uri[2]}`;
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'https:' || !['open.spotify.com', 'spotify.link'].includes(parsed.hostname)) throw new SpotifyLinkError('invalid_link', 'Solo se admiten enlaces oficiales de Spotify.');
  return parsed.toString();
}

async function browserPreview(input: string): Promise<SpotifyLinkPreview> {
  const normalizedUrl = normalizeBrowserLink(input);
  const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(normalizedUrl)}`);
  if (!response.ok) throw new SpotifyLinkError('preview_unavailable', 'Spotify no pudo generar la vista previa de este enlace.');
  const value = await response.json() as { title: string; thumbnail_url?: string; provider_name?: string };
  const match = /open\.spotify\.com\/(?:intl-[^/]+\/)?(track|album|playlist|artist|show|episode)\/([^?]+)/.exec(normalizedUrl);
  if (!match) throw new SpotifyLinkError('invalid_link', 'Ese tipo de contenido de Spotify no es compatible.');
  return { normalizedUrl, spotifyUri: `spotify:${match[1]}:${match[2]}`, embedUrl: `https://open.spotify.com/embed/${match[1]}/${match[2]}`, entityType: match[1] as SpotifyLinkPreview['entityType'], spotifyId: match[2], title: value.title, thumbnailUrl: value.thumbnail_url ?? null, providerName: value.provider_name ?? 'Spotify', attributionUrl: 'https://www.spotify.com/' };
}

async function preview(input: string): Promise<SpotifyLinkPreview> {
  if (!('__TAURI_INTERNALS__' in window)) return browserPreview(input);
  try {
    return await invoke<SpotifyLinkPreview>('spotify_link_preview', { input });
  } catch (cause) {
    if (typeof cause === 'object' && cause && 'code' in cause && 'message' in cause) {
      const error = cause as { code: string; message: string; details?: unknown };
      throw new SpotifyLinkError(error.code, error.message, error.details);
    }
    throw new SpotifyLinkError('preview_unavailable', typeof cause === 'string' ? cause : 'Spotify no respondió.');
  }
}

export class NativeSpotifyLinkService implements SpotifyLinkService {
  preview = preview;
  async open(previewValue: SpotifyLinkPreview): Promise<void> { await openExternal(previewValue.normalizedUrl); }
}
