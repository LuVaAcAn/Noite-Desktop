import type { LibraryRepository } from '../library-repository';
import type {
  CreateLibraryItemInput,
  LibraryFilters,
  LibraryItem,
  LibraryPage,
  UpdateLibraryItemInput,
} from '../../entities/library-item';
import { localStore } from '../../local/local-store';
import { purgeArchivedActivityFromState } from '../../local/purge-state';
import { removeLocalMedia } from '../../local/local-media';

function id() {
  return `item-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_PAGE_SIZE = 16;

export class LocalLibraryRepository implements LibraryRepository {
  async list(spaceId: string, filters: LibraryFilters = {}): Promise<LibraryPage> {
    await localStore.ensureLoaded();
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;

    let results = localStore.get('libraryItems').filter((item) => item.spaceId === spaceId && (filters.onlyArchived ? !!item.archivedAt : !item.archivedAt));

    if (filters.kind) results = results.filter((item) => item.kind === filters.kind);
    if (filters.customCategoryId) results = results.filter((item) => item.customCategoryId === filters.customCategoryId);
    if (filters.status) results = results.filter((item) => item.status === filters.status);
    if (filters.onlyFavorites) results = results.filter((item) => item.isFavorite);
    if (filters.search) {
      const term = filters.search.toLowerCase();
      results = results.filter((item) => item.title.toLowerCase().includes(term));
    }

    results = [...results].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const totalItems = results.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const start = (page - 1) * pageSize;
    const items = results.slice(start, start + pageSize);

    return { items, page, pageSize, totalItems, totalPages };
  }

  async get(itemId: string): Promise<LibraryItem | null> {
    await localStore.ensureLoaded();
    return localStore.get('libraryItems').find((item) => item.id === itemId) ?? null;
  }

  async create(input: CreateLibraryItemInput): Promise<LibraryItem> {
    await localStore.ensureLoaded();
    const settings = localStore.get('settings');

    const item: LibraryItem = {
      id: id(),
      spaceId: input.spaceId,
      title: input.title,
      kind: input.kind,
      status: input.status ?? 'idea',
      description: input.description ?? null,
      coverUrl: input.coverUrl ?? null,
      customCoverPath: input.customCoverPath ?? null,
      externalProvider: input.externalProvider ?? 'manual',
      externalId: input.externalId ?? null,
      externalUrl: input.externalUrl ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      priority: input.priority ?? 'medium',
      tags: input.tags ?? [],
      isFavorite: false,
      ideaBy: input.ideaBy ?? null,
      customCategoryId: input.customCategoryId ?? null,
      metadata: {},
      createdBy: settings.activeProfileId,
      updatedBy: settings.activeProfileId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    };
    await localStore.set('libraryItems', [item, ...localStore.get('libraryItems')]);
    return item;
  }

  async update(itemId: string, input: UpdateLibraryItemInput): Promise<LibraryItem> {
    await localStore.ensureLoaded();
    const items = localStore.get('libraryItems');
    const index = items.findIndex((i) => i.id === itemId);
    if (index === -1) throw new Error('Elemento no encontrado');
    const updated: LibraryItem = { ...items[index], ...input, updatedAt: new Date().toISOString() };
    const next = [...items];
    next[index] = updated;
    await localStore.set('libraryItems', next);
    return updated;
  }

  async archive(itemId: string): Promise<void> {
    await localStore.ensureLoaded();
    const items = localStore.get('libraryItems');
    const next = items.map((i) => (i.id === itemId ? { ...i, archivedAt: new Date().toISOString() } : i));
    await localStore.set('libraryItems', next);
  }

  async restore(itemId: string): Promise<void> {
    await localStore.ensureLoaded();
    const items = localStore.get('libraryItems');
    if (!items.some((item) => item.id === itemId)) throw new Error('Elemento no encontrado');
    await localStore.set('libraryItems', items.map((item) => item.id === itemId ? { ...item, archivedAt: null, updatedAt: new Date().toISOString() } : item));
  }

  async previewPurge(itemId: string) {
    const state = await localStore.ensureLoaded();
    return purgeArchivedActivityFromState(state, itemId).preview;
  }

  async purgeArchived(itemId: string) {
    const state = await localStore.ensureLoaded();
    const purged = purgeArchivedActivityFromState(state, itemId);
    await localStore.commit(purged.state);
    await Promise.all(purged.candidateMediaPaths.map((path) => removeLocalMedia(path).catch(() => undefined)));
    return { ...purged.preview, mediaFiles: purged.candidateMediaPaths.length, completedAt: new Date().toISOString() };
  }

  async toggleFavorite(itemId: string, isFavorite: boolean): Promise<LibraryItem> {
    return this.update(itemId, { isFavorite });
  }
}
