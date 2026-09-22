import type { ReviewRepository } from '../review-repository';
import type { Review, ReviewSummary, UpsertReviewInput } from '../../entities/review';
import type { MemoryTrack, SpotifyTrack } from '../../entities/memory';
import { localStore } from '../../local/local-store';
import type { SavedMusicItem } from '../../entities/saved-music';

function id(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildSummary(planItemId: string): ReviewSummary {
  const reviews = localStore.get('reviews').filter((r) => r.planItemId === planItemId);
  const sharedReview = localStore.get('sharedReviews').find((r) => r.planItemId === planItemId) ?? null;
  const rated = reviews.filter((r) => r.rating != null);
  const averageRating =
    rated.length > 0 ? rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length : null;
  const track = [...localStore.get('memoryTracks')]
    .filter((item) => item.planItemId === planItemId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  return { planItemId, reviews, sharedReview, averageRating, track };
}

export class LocalReviewRepository implements ReviewRepository {
  async upsert(input: UpsertReviewInput): Promise<ReviewSummary> {
    await localStore.ensureLoaded();
    const settings = localStore.get('settings');
    const actorId = settings.activeProfileId;
    const reviews = localStore.get('reviews');
    const existing = reviews.find((r) => r.planItemId === input.planItemId && r.userId === actorId);

    let next: Review[];
    if (existing) {
      next = reviews.map((r) =>
        r.id === existing.id
          ? {
              ...r,
              rating: input.rating !== undefined ? input.rating : r.rating,
              comment: input.comment !== undefined ? input.comment : r.comment,
              tags: input.tags !== undefined ? input.tags : r.tags,
              updatedAt: new Date().toISOString(),
            }
          : r
      );
    } else {
      const created: Review = {
        id: id('review'),
        spaceId: input.spaceId,
        planItemId: input.planItemId,
        userId: actorId,
        rating: input.rating ?? null,
        comment: input.comment ?? null,
        tags: input.tags ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      next = [...reviews, created];
    }
    await localStore.set('reviews', next);
    return buildSummary(input.planItemId);
  }

  async getForPlanItem(planItemId: string): Promise<ReviewSummary> {
    await localStore.ensureLoaded();
    return buildSummary(planItemId);
  }

  async setTrack(planItemId: string, spotifyUrlOrTitle: string): Promise<MemoryTrack> {
    await localStore.ensureLoaded();
    const settings = localStore.get('settings');
    const isUrl = spotifyUrlOrTitle.startsWith('http');
    const track: MemoryTrack = {
      id: id('track'),
      spaceId: 'local-space',
      planItemId,
      provider: isUrl ? 'spotify' : 'manual',
      externalId: null,
      title: isUrl ? 'Canción de Spotify' : spotifyUrlOrTitle,
      artist: null,
      coverUrl: null,
      externalUrl: isUrl ? spotifyUrlOrTitle : '',
      spotifyUri: null,
      album: null,
      durationMs: null,
      cachedArtworkPath: null,
      createdBy: settings.activeProfileId,
      createdAt: new Date().toISOString(),
    };
    await localStore.set('memoryTracks', [
      ...localStore.get('memoryTracks').filter((item) => item.planItemId !== planItemId),
      track,
    ]);
    return track;
  }

  async removeTrack(planItemId: string): Promise<void> {
    await localStore.ensureLoaded();
    await localStore.set(
      'memoryTracks',
      localStore.get('memoryTracks').filter((item) => item.planItemId !== planItemId)
    );
  }

  async setSpotifyTrack(planItemId: string, spotify: SpotifyTrack): Promise<MemoryTrack> {
    await localStore.ensureLoaded();
    const settings = localStore.get('settings');
    const existingMusic = localStore.get('savedMusicItems').find((item) => item.provider === 'spotify' && item.providerId === spotify.id);
    const savedMusic: SavedMusicItem = existingMusic ?? {
      id: id('music'), spaceId: 'local-space', provider: 'spotify', providerId: spotify.id, spotifyUri: spotify.uri, entityType: 'track',
      title: spotify.title, artist: spotify.artist, artworkUrl: spotify.artworkUrl,
      artworkStoragePath: spotify.cachedArtworkPath ?? null, externalUrl: spotify.externalUrl,
      localStoragePath: null, localUrl: null, mimeType: null, durationMs: spotify.durationMs,
      createdBy: settings.activeProfileId, createdAt: new Date().toISOString(),
    };
    const track: MemoryTrack = {
      id: id('track'),
      spaceId: 'local-space',
      planItemId,
      provider: 'spotify',
      externalId: spotify.id,
      title: spotify.title,
      artist: spotify.artist,
      coverUrl: spotify.artworkUrl,
      externalUrl: spotify.externalUrl,
      spotifyUri: spotify.uri,
      album: spotify.album,
      durationMs: spotify.durationMs,
      cachedArtworkPath: spotify.cachedArtworkPath ?? null,
      savedMusicItemId: savedMusic.id,
      createdBy: settings.activeProfileId,
      createdAt: new Date().toISOString(),
    };
    await localStore.commit({
      memoryTracks: [...localStore.get('memoryTracks').filter((item) => item.planItemId !== planItemId), track],
      savedMusicItems: existingMusic ? localStore.get('savedMusicItems') : [savedMusic, ...localStore.get('savedMusicItems')],
    });
    return track;
  }

  async listTracks(spaceId: string): Promise<MemoryTrack[]> {
    await localStore.ensureLoaded();
    return localStore.get('memoryTracks')
      .filter((track) => track.spaceId === spaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
