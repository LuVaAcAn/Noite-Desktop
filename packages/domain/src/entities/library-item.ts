// Entidad LibraryItem — PRD sección 12.1 `library_items`

export type LibraryItemKind =
  | 'movie'
  | 'series'
  | 'season_or_episode'
  | 'video_game'
  | 'creative_activity'
  | 'music_listening'
  | 'themed_conversation'
  | 'reading'
  | 'study'
  | 'parallel_work'
  | 'browser_game'
  | 'custom'
  | 'other';

export type LibraryItemStatus =
  | 'idea'
  | 'pending'
  | 'planned'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'abandoned'
  | 'archived';

export type LibraryItemPriority = 'low' | 'medium' | 'high';

export type ExternalProvider = 'tmdb' | 'igdb' | 'spotify' | 'manual';

export interface LibraryItem {
  id: string;
  spaceId: string;
  title: string;
  kind: LibraryItemKind;
  status: LibraryItemStatus;
  description: string | null;
  coverUrl: string | null;
  customCoverPath: string | null;
  externalProvider: ExternalProvider | null;
  externalId: string | null;
  externalUrl: string | null;
  estimatedMinutes: number | null;
  priority: LibraryItemPriority;
  tags: string[];
  isFavorite: boolean;
  /** Nombre (snapshot) de quién tuvo la idea — ver PRD ampliación, punto 5. */
  ideaBy: string | null;
  /** Si kind === 'custom', a qué CustomCategory (LocalSettings) pertenece. */
  customCategoryId: string | null;
  metadata: Record<string, unknown>;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface CreateLibraryItemInput {
  spaceId: string;
  title: string;
  kind: LibraryItemKind;
  status?: LibraryItemStatus;
  description?: string;
  coverUrl?: string;
  customCoverPath?: string;
  estimatedMinutes?: number;
  priority?: LibraryItemPriority;
  tags?: string[];
  ideaBy?: string;
  customCategoryId?: string;
  externalProvider?: ExternalProvider;
  externalId?: string;
  externalUrl?: string;
}

export interface UpdateLibraryItemInput {
  title?: string;
  status?: LibraryItemStatus;
  description?: string;
  coverUrl?: string;
  customCoverPath?: string | null;
  estimatedMinutes?: number;
  priority?: LibraryItemPriority;
  tags?: string[];
  isFavorite?: boolean;
}

export interface LibraryFilters {
  kind?: LibraryItemKind;
  customCategoryId?: string;
  status?: LibraryItemStatus;
  onlyFavorites?: boolean;
  onlyArchived?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface LibraryPage {
  items: LibraryItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
