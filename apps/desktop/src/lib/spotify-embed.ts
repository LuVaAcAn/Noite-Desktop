import type { SavedMusicItem, SpotifyEntityType, SpotifyLinkPreview } from '@proyecto-noche/domain';

const ENTITY_TYPES = new Set<SpotifyEntityType>(['track', 'album', 'playlist', 'artist', 'show', 'episode']);

function identityFromUrl(value: string | null | undefined): { type: SpotifyEntityType; id: string } | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const offset = parts[0]?.startsWith('intl-') ? 1 : 0;
    const type = parts[offset] as SpotifyEntityType;
    const id = parts[offset + 1];
    return ENTITY_TYPES.has(type) && /^[A-Za-z0-9]+$/.test(id ?? '') ? { type, id } : null;
  } catch {
    return null;
  }
}

export function spotifyEmbedUrl(value: Pick<SavedMusicItem, 'provider' | 'providerId' | 'spotifyUri' | 'entityType' | 'externalUrl'> | SpotifyLinkPreview): string | null {
  if ('provider' in value && value.provider !== 'spotify') return null;
  if ('embedUrl' in value) {
    const identity = identityFromUrl(value.embedUrl.replace('/embed/', '/'));
    if (identity) return `https://open.spotify.com/embed/${identity.type}/${identity.id}?utm_source=noite`;
  }
  const uri = value.spotifyUri && /^spotify:(track|album|playlist|artist|show|episode):([A-Za-z0-9]+)$/.exec(value.spotifyUri);
  if (uri) return `https://open.spotify.com/embed/${uri[1]}/${uri[2]}?utm_source=noite`;
  if ('providerId' in value && value.providerId && value.entityType !== 'audio' && ENTITY_TYPES.has(value.entityType)) {
    return `https://open.spotify.com/embed/${value.entityType}/${value.providerId}?utm_source=noite`;
  }
  const fromUrl = identityFromUrl('normalizedUrl' in value ? value.normalizedUrl : value.externalUrl);
  return fromUrl ? `https://open.spotify.com/embed/${fromUrl.type}/${fromUrl.id}?utm_source=noite` : null;
}

export function isAllowedSpotifyArtworkUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (host === 'i.scdn.co' || host.endsWith('.scdn.co') || host.endsWith('.spotifycdn.com'));
  } catch {
    return false;
  }
}
