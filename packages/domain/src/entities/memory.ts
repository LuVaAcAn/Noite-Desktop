// Entidades MemoryTrack / Attachment / Session — PRD sección 12.1

export type MemoryTrackProvider = 'spotify' | 'manual';

export interface MemoryTrack {
  id: string;
  spaceId: string;
  planItemId: string;
  savedMusicItemId?: string | null;
  provider: MemoryTrackProvider;
  externalId: string | null;
  title: string;
  artist: string | null;
  coverUrl: string | null;
  externalUrl: string;
  spotifyUri: string | null;
  album: string | null;
  durationMs: number | null;
  cachedArtworkPath: string | null;
  createdBy: string;
  createdAt: string;
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  title: string;
  artist: string | null;
  album: string | null;
  durationMs: number | null;
  artworkUrl: string | null;
  cachedArtworkPath?: string | null;
  externalUrl: string;
}

export interface Attachment {
  id: string;
  spaceId: string;
  planItemId: string | null;
  uploadedBy: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
  createdAt: string;
  archivedAt: string | null;
  /** URL firmada o pública resuelta por el repositorio, no persistida tal cual. */
  resolvedUrl?: string;
}

export type SessionStatus = 'active' | 'paused' | 'ended';

export interface Session {
  id: string;
  spaceId: string;
  planId: string | null;
  status: SessionStatus;
  currentPlanItemId: string | null;
  startedAt: string;
  endedAt: string | null;
  createdBy: string;
  sharedNotes: string | null;
}
