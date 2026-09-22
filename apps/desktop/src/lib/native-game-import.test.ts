import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureLocalPersistence, DEFAULT_LOCAL_SETTINGS, localStore } from '@proyecto-noche/domain';
import { commitGameImport } from './native-game-discovery';

const native = vi.hoisted(() => ({ invoke: vi.fn(), invalidate: vi.fn() }));
vi.mock('./invoke', () => ({ invoke: native.invoke }));
vi.mock('./native-persistence', () => ({ invalidateNativePersistenceCache: native.invalidate }));
const database: Record<string, unknown> = {};

beforeEach(async () => {
  native.invoke.mockReset(); native.invalidate.mockReset();
  Object.keys(database).forEach((key) => delete database[key]);
  database.settings = structuredClone(DEFAULT_LOCAL_SETTINGS);
  database.libraryItems = [];
  configureLocalPersistence({
    async get<T>(key: string) { return database[key] as T | undefined; },
    async getAll() { return structuredClone(database); },
    async setMany(entries) { Object.assign(database, structuredClone(entries)); },
  });
  await localStore.reload();
});

describe('native game import refresh', () => {
  it('refreshes the library before a subsequent edit can overwrite newly imported games', async () => {
    native.invoke.mockImplementation(async () => {
      database.libraryItems = [{ id: 'native-game', title: 'Juego instalado' }];
      return { createdCount: 1 };
    });
    await commitGameImport({ newItems: [], bindings: [], ignoredInstallationIds: [] });
    expect(native.invalidate).toHaveBeenCalledOnce();
    expect(localStore.get('libraryItems')[0].id).toBe('native-game');
    await localStore.set('libraryItems', localStore.get('libraryItems').map((item) => ({ ...item, title: 'Editado' })));
    expect(database.libraryItems).toEqual([{ id: 'native-game', title: 'Editado' }]);
  });
  it('does not replace the in-memory library after a failed native transaction', async () => {
    native.invoke.mockRejectedValue(new Error('transaction rolled back'));
    await expect(commitGameImport({ newItems: [], bindings: [], ignoredInstallationIds: [] })).rejects.toThrow('rolled back');
    expect(native.invalidate).not.toHaveBeenCalled();
    expect(localStore.get('libraryItems')).toEqual([]);
  });
});
