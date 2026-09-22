import type { SpotifyEntityType } from '../repositories/music-repository';

export type SavedMusicProvider = 'spotify' | 'local';

export interface SavedMusicItem {
  id: string;
  spaceId: string;
  provider: SavedMusicProvider;
  providerId: string | null;
  spotifyUri: string | null;
  entityType: SpotifyEntityType | 'audio';
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  artworkStoragePath: string | null;
  externalUrl: string | null;
  localStoragePath: string | null;
  localUrl: string | null;
  mimeType: string | null;
  durationMs: number | null;
  createdBy: string;
  createdAt: string;
}

export interface CreateSavedMusicInput {
  spaceId: string;
  provider: SavedMusicProvider;
  providerId?: string | null;
  spotifyUri?: string | null;
  entityType: SpotifyEntityType | 'audio';
  title: string;
  artist?: string | null;
  artworkUrl?: string | null;
  artworkStoragePath?: string | null;
  externalUrl?: string | null;
  localStoragePath?: string | null;
  localUrl?: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
}
