import type { CreateSavedMusicInput, SavedMusicItem } from '../../entities/saved-music';
import { localStore } from '../../local/local-store';
import type { MusicLibraryRepository } from '../music-library-repository';
import { removeLocalMedia } from '../../local/local-media';

function id() { return `music-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`; }

function duplicateKey(item: Pick<SavedMusicItem, 'provider' | 'providerId' | 'externalUrl' | 'localStoragePath'>) {
  return item.provider === 'spotify' ? `spotify:${item.providerId ?? item.externalUrl}` : `local:${item.localStoragePath}`;
}

export class LocalMusicLibraryRepository implements MusicLibraryRepository {
  async list(spaceId: string) {
    await localStore.ensureLoaded();
    return [...localStore.get('savedMusicItems')].filter((item) => item.spaceId === spaceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async save(input: CreateSavedMusicInput) {
    await localStore.ensureLoaded();
    const settings = localStore.get('settings');
    const candidate: SavedMusicItem = {
      id: id(), spaceId: input.spaceId, provider: input.provider,
      providerId: input.providerId ?? null,
      spotifyUri: input.spotifyUri ?? (input.provider === 'spotify' && input.providerId && input.entityType !== 'audio' ? `spotify:${input.entityType}:${input.providerId}` : null),
      entityType: input.entityType,
      title: input.title.trim() || 'Audio local', artist: input.artist ?? null,
      artworkUrl: input.artworkUrl ?? null, artworkStoragePath: input.artworkStoragePath ?? null,
      externalUrl: input.externalUrl ?? null, localStoragePath: input.localStoragePath ?? null,
      localUrl: input.localUrl ?? null, mimeType: input.mimeType ?? null,
      durationMs: input.durationMs ?? null, createdBy: settings.activeProfileId, createdAt: new Date().toISOString(),
    };
    const key = duplicateKey(candidate);
    const existing = localStore.get('savedMusicItems').find((item) => duplicateKey(item) === key);
    if (existing) return existing;
    await localStore.set('savedMusicItems', [candidate, ...localStore.get('savedMusicItems')]);
    return candidate;
  }

  async rename(itemId: string, title: string) {
    await localStore.ensureLoaded();
    const current = localStore.get('savedMusicItems').find((item) => item.id === itemId);
    if (!current) throw new Error('Música no encontrada.');
    const updated = { ...current, title: title.trim() || current.title };
    await localStore.set('savedMusicItems', localStore.get('savedMusicItems').map((item) => item.id === itemId ? updated : item));
    return updated;
  }

  async remove(itemId: string) {
    await localStore.ensureLoaded();
    const current = localStore.get('savedMusicItems').find((item) => item.id === itemId);
    if (current?.localStoragePath && !current.localStoragePath.startsWith('browser-audio:')) await removeLocalMedia(current.localStoragePath).catch(() => undefined);
    await localStore.commit({ savedMusicItems: localStore.get('savedMusicItems').filter((item) => item.id !== itemId), memoryTracks: localStore.get('memoryTracks').filter((item) => item.savedMusicItemId !== itemId) });
  }

  async attach(planItemId: string, savedMusicItemId: string) {
    await localStore.ensureLoaded();
    const source = localStore.get('savedMusicItems').find((item) => item.id === savedMusicItemId);
    if (!source) throw new Error('Música no encontrada.');
    const existing = localStore.get('memoryTracks').find((item) => item.planItemId === planItemId);
    if (existing) {
      await localStore.set('memoryTracks', localStore.get('memoryTracks').map((item) => item.planItemId === planItemId ? {
        ...item, savedMusicItemId, provider: source.provider === 'local' ? 'manual' as const : 'spotify' as const,
        externalId: source.providerId, title: source.title, artist: source.artist, coverUrl: source.artworkUrl,
        externalUrl: source.externalUrl ?? source.localUrl ?? '', spotifyUri: source.spotifyUri, durationMs: source.durationMs,
        cachedArtworkPath: source.artworkStoragePath,
      } : item));
      return;
    }
    const settings = localStore.get('settings');
    await localStore.set('memoryTracks', [...localStore.get('memoryTracks'), {
      id: `track-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
      spaceId: source.spaceId, planItemId, savedMusicItemId, provider: source.provider === 'local' ? 'manual' : 'spotify',
      externalId: source.providerId, title: source.title, artist: source.artist, coverUrl: source.artworkUrl,
      externalUrl: source.externalUrl ?? source.localUrl ?? '', spotifyUri: source.spotifyUri, album: null,
      durationMs: source.durationMs, cachedArtworkPath: source.artworkStoragePath,
      createdBy: settings.activeProfileId, createdAt: new Date().toISOString(),
    }]);
  }

  async detach(planItemId: string) {
    await localStore.ensureLoaded();
    await localStore.set('memoryTracks', localStore.get('memoryTracks').filter((item) => item.planItemId !== planItemId));
  }
}
