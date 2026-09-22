import type { LibraryItem } from '../../entities/library-item';
import type { MemoryTrack } from '../../entities/memory';
import type { Plan, PlanItem } from '../../entities/plan';
import type { Review } from '../../entities/review';
import type { SavedMusicItem } from '../../entities/saved-music';
import { localStore } from '../../local/local-store';
import type { ActivityRepository, RegisterActivityInput, RegisterActivityResult } from '../activity-repository';

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export class LocalActivityRepository implements ActivityRepository {
  async register(input: RegisterActivityInput): Promise<RegisterActivityResult> {
    await localStore.ensureLoaded();
    const settings = localStore.get('settings');
    const now = new Date().toISOString();
    const item: LibraryItem = {
      id: id('item'),
      spaceId: input.spaceId,
      title: input.title,
      kind: input.kind,
      status: input.mode === 'memory' ? 'completed' : 'pending',
      description: null,
      coverUrl: input.coverUrl ?? null,
      customCoverPath: input.customCoverPath ?? null,
      externalProvider: input.externalProvider ?? 'manual',
      externalId: input.externalId ?? null,
      externalUrl: null,
      estimatedMinutes: null,
      priority: 'medium',
      tags: [],
      isFavorite: false,
      ideaBy: input.ideaBy ?? null,
      customCategoryId: input.customCategoryId ?? null,
      metadata: {},
      createdBy: settings.activeProfileId,
      updatedBy: settings.activeProfileId,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };

    if (input.mode === 'later') {
      await localStore.set('libraryItems', [item, ...localStore.get('libraryItems')]);
      return { item, plan: null, planItem: null, track: null };
    }

    const planId = id('plan');
    const planItem: PlanItem = {
      id: id('planitem'),
      planId,
      libraryItemId: item.id,
      titleSnapshot: item.title,
      kindSnapshot: item.kind,
      position: 0,
      status: 'completed',
      estimatedMinutes: null,
      isPrimary: true,
      isOptional: false,
      notes: null,
      startedAt: now,
      completedAt: now,
    };
    const plan: Plan = {
      id: planId,
      spaceId: input.spaceId,
      title: item.title,
      status: 'completed',
      startsAt: now,
      estimatedMinutes: null,
      notes: null,
      coverPath: null,
      createdBy: settings.activeProfileId,
      updatedBy: settings.activeProfileId,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      cancelledAt: null,
      items: [planItem],
    };
    const review: Review | null = input.rating !== undefined || input.comment
      ? {
          id: id('review'),
          spaceId: input.spaceId,
          planItemId: planItem.id,
          userId: settings.activeProfileId,
          rating: input.rating ?? null,
          comment: input.comment ?? null,
          tags: [],
          createdAt: now,
          updatedAt: now,
        }
      : null;
    const isUrl = input.song?.startsWith('http') ?? false;
    let track: MemoryTrack | null = input.spotifyTrack
      ? {
          id: id('track'), spaceId: input.spaceId, planItemId: planItem.id, provider: 'spotify',
          externalId: input.spotifyTrack.id, title: input.spotifyTrack.title, artist: input.spotifyTrack.artist,
          coverUrl: input.spotifyTrack.artworkUrl, externalUrl: input.spotifyTrack.externalUrl,
          spotifyUri: input.spotifyTrack.uri, album: input.spotifyTrack.album, durationMs: input.spotifyTrack.durationMs,
          cachedArtworkPath: input.spotifyTrack.cachedArtworkPath ?? null, createdBy: settings.activeProfileId, createdAt: now,
        }
      : input.song
      ? {
          id: id('track'),
          spaceId: input.spaceId,
          planItemId: planItem.id,
          provider: isUrl ? 'spotify' : 'manual',
          externalId: null,
          title: isUrl ? 'Canción asociada' : input.song,
          artist: null,
          coverUrl: null,
          externalUrl: isUrl ? input.song : '',
          spotifyUri: null,
          album: null,
          durationMs: null,
          cachedArtworkPath: null,
          createdBy: settings.activeProfileId,
          createdAt: now,
        }
      : null;
    let savedMusic: SavedMusicItem | null = null;
    if (track) {
      const existing = localStore.get('savedMusicItems').find((item) => item.provider === (track!.provider === 'spotify' ? 'spotify' : 'local') && (item.providerId === track!.externalId || item.externalUrl === track!.externalUrl));
      savedMusic = existing ?? {
        id: id('music'), spaceId: input.spaceId, provider: track.provider === 'spotify' ? 'spotify' : 'local',
        providerId: track.externalId, spotifyUri: track.provider === 'spotify' ? track.spotifyUri : null,
        entityType: track.provider === 'spotify' ? 'track' : 'audio', title: track.title,
        artist: track.artist, artworkUrl: track.coverUrl, artworkStoragePath: track.cachedArtworkPath,
        externalUrl: track.provider === 'spotify' ? track.externalUrl : null, localStoragePath: null,
        localUrl: track.provider === 'manual' ? track.externalUrl : null, mimeType: null, durationMs: track.durationMs,
        createdBy: settings.activeProfileId, createdAt: now,
      };
      track = { ...track, savedMusicItemId: savedMusic.id };
    }

    await localStore.commit({
      libraryItems: [item, ...localStore.get('libraryItems')],
      plans: [plan, ...localStore.get('plans')],
      reviews: review ? [...localStore.get('reviews'), review] : localStore.get('reviews'),
      memoryTracks: track ? [...localStore.get('memoryTracks'), track] : localStore.get('memoryTracks'),
      savedMusicItems: savedMusic && !localStore.get('savedMusicItems').some((item) => item.id === savedMusic!.id) ? [savedMusic, ...localStore.get('savedMusicItems')] : localStore.get('savedMusicItems'),
    });
    return { item, plan, planItem, track };
  }
}
