import type { ExternalProvider, LibraryItem, LibraryItemKind } from '../entities/library-item';
import type { MemoryTrack } from '../entities/memory';
import type { SpotifyTrack } from '../entities/memory';
import type { Plan, PlanItem } from '../entities/plan';

export interface RegisterActivityInput {
  spaceId: string;
  mode: 'later' | 'memory';
  title: string;
  kind: LibraryItemKind;
  rating?: number;
  comment?: string;
  song?: string;
  spotifyTrack?: SpotifyTrack;
  coverUrl?: string;
  customCoverPath?: string;
  ideaBy?: string;
  customCategoryId?: string;
  externalProvider?: ExternalProvider;
  externalId?: string;
}

export interface RegisterActivityResult {
  item: LibraryItem;
  plan: Plan | null;
  planItem: PlanItem | null;
  track: MemoryTrack | null;
}

export interface ActivityRepository {
  register(input: RegisterActivityInput): Promise<RegisterActivityResult>;
}
