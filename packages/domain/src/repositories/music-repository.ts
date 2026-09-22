export type SpotifyEntityType = 'track' | 'album' | 'playlist' | 'artist' | 'show' | 'episode';

export interface SpotifyLinkPreview {
  normalizedUrl: string;
  spotifyUri: string | null;
  embedUrl: string;
  entityType: SpotifyEntityType;
  spotifyId: string | null;
  title: string;
  thumbnailUrl: string | null;
  providerName: 'Spotify' | string;
  attributionUrl: string;
}

export interface SpotifyLinkService {
  preview(input: string): Promise<SpotifyLinkPreview>;
  open(preview: SpotifyLinkPreview): Promise<void>;
}
