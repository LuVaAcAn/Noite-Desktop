import type { CreateSavedMusicInput, SavedMusicItem } from '../entities/saved-music';

export interface MusicLibraryRepository {
  list(spaceId: string): Promise<SavedMusicItem[]>;
  save(input: CreateSavedMusicInput): Promise<SavedMusicItem>;
  rename(id: string, title: string): Promise<SavedMusicItem>;
  remove(id: string): Promise<void>;
  attach(planItemId: string, savedMusicItemId: string): Promise<void>;
  detach(planItemId: string): Promise<void>;
}
