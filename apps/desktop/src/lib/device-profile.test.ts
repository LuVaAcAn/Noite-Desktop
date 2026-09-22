// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { configureLocalPersistence, localStore, LocalSettingsRepository, LocalActivityRepository, DEFAULT_LOCAL_SETTINGS } from '@proyecto-noche/domain';

afterEach(() => localStorage.clear());

it('recuerda la persona solo en este equipo y conserva autores al importar', async () => {
  const data = new Map<string, unknown>();
  configureLocalPersistence({
    async get<T>(key: string) { return data.get(key) as T; },
    async setMany(entries, clear) { if (clear) data.clear(); Object.entries(entries).forEach(([key, value]) => data.set(key, structuredClone(value))); },
    async getAll() { return Object.fromEntries(data); },
  });
  const settings = { ...DEFAULT_LOCAL_SETTINGS, userName: 'Ana', partnerName: 'Luz' };
  await localStore.importBackup(JSON.stringify({ version: 1, data: { settings, libraryItems: [] } }));
  const repository = new LocalSettingsRepository();
  const activity = new LocalActivityRepository();
  const first = await activity.register({ spaceId: 'test', title: 'Primera', kind: 'video_game', mode: 'later', ideaBy: 'Ana' });
  await repository.setActiveActor(settings.profiles.partner.id);
  await localStore.reload();
  expect((await repository.get()).activeProfileId).toBe(settings.profiles.partner.id);
  const second = await activity.register({ spaceId: 'test', title: 'Segunda', kind: 'video_game', mode: 'later', ideaBy: 'Luz' });
  expect(second.item.createdBy).toBe(settings.profiles.partner.id);
  const backup = await localStore.exportBackup();
  await repository.setActiveActor(settings.profiles.primary.id);
  await localStore.importBackup(backup.contents);
  expect((await repository.get()).activeProfileId).toBe(settings.profiles.primary.id);
  expect(localStore.get('libraryItems').find((item) => item.id === first.item.id)?.createdBy).toBe(settings.profiles.primary.id);
  expect(localStore.get('libraryItems').find((item) => item.id === second.item.id)?.createdBy).toBe(settings.profiles.partner.id);
  await expect(repository.setActiveActor('unknown')).rejects.toThrow();
});
