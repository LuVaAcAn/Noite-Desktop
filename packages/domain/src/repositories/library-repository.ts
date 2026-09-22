import type {
  CreateLibraryItemInput,
  LibraryFilters,
  LibraryItem,
  LibraryPage,
  UpdateLibraryItemInput,
} from '../entities/library-item';
import type { PurgePreview, PurgeResult } from '../entities/data-management';

export interface LibraryRepository {
  list(spaceId: string, filters?: LibraryFilters): Promise<LibraryPage>;
  get(id: string): Promise<LibraryItem | null>;
  create(input: CreateLibraryItemInput): Promise<LibraryItem>;
  update(id: string, input: UpdateLibraryItemInput): Promise<LibraryItem>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  previewPurge(id: string): Promise<PurgePreview>;
  purgeArchived(id: string): Promise<PurgeResult>;
  toggleFavorite(id: string, isFavorite: boolean): Promise<LibraryItem>;
}
