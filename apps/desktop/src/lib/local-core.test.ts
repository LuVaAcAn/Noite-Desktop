import { beforeEach, describe, expect, it } from 'vitest';
import {
  configureLocalPersistence,
  LocalActivityRepository,
  LocalLibraryRepository,
  LocalPlanRepository,
  LocalReviewRepository,
  LocalSettingsRepository,
  LocalMusicLibraryRepository,
  localStore,
  type LocalPersistenceAdapter,
} from '@proyecto-noche/domain';
import { resolveSection } from '../features/library/section-resolver';

const memory = new Map<string, unknown>();
let failNextWrite = false;
const adapter: LocalPersistenceAdapter = {
  async get<T>(key: string) { return memory.get(key) as T | undefined; },
  async setMany(entries, clearFirst) {
    if (failNextWrite) {
      failNextWrite = false;
      throw new Error('Disk full');
    }
    if (clearFirst) memory.clear();
    Object.entries(entries).forEach(([key, value]) => memory.set(key, structuredClone(value)));
  },
  async getAll() { return Object.fromEntries(memory); },
};

const emptyBackup = JSON.stringify({
  version: 1,
  exportedAt: '2026-01-01T00:00:00.000Z',
  data: {
    settings: { onboardingComplete: true, spaceName: 'Test', userName: 'Ana', partnerName: 'Luz', avatarDataUrl: null, activeActorId: 'me', customCategories: [] },
    libraryItems: [], plans: [], reviews: [], sharedReviews: [], memoryTracks: [], attachments: [],
  },
});

beforeEach(async () => {
  failNextWrite = false;
  configureLocalPersistence(adapter);
  await localStore.importBackup(emptyBackup);
});

describe('local core', () => {
  it('previsualiza los nombres reales del respaldo y actualiza ambos perfiles', async () => {
    const settings = new LocalSettingsRepository();
    await settings.update({ userName: 'Ana', partnerName: 'Luz' });
    expect((await settings.get()).profiles.partner.displayName).toBe('Luz');
    const backup = await localStore.exportBackup();
    expect(localStore.previewImport(backup.contents).manifest.coupleNames).toEqual(['Ana', 'Luz']);
    const tampered = JSON.parse(backup.contents);
    tampered.manifest.coupleNames = ['Otra', 'Pareja'];
    expect(localStore.previewImport(JSON.stringify(tampered)).manifest.coupleNames).toEqual(['Ana', 'Luz']);
    expect(localStore.previewImport(emptyBackup).manifest.coupleNames).toEqual(['Ana', 'Luz']);
  });
  it('migrates the existing edition to light without dropping library data and retains later theme choices', async () => {
    const legacy = JSON.parse(emptyBackup);
    legacy.data.settings.colorMode = 'dark';
    legacy.data.libraryItems = [{ id: 'kept', title: 'Mi juego' }];
    await localStore.importBackup(JSON.stringify(legacy));
    expect(localStore.get('settings').colorMode).toBe('light');
    expect(localStore.get('libraryItems')[0].id).toBe('kept');
    const settings = localStore.get('settings');
    await localStore.set('settings', { ...settings, colorMode: 'dark' });
    await localStore.reload();
    expect(localStore.get('settings').colorMode).toBe('dark');
  });
  it('migrates legacy me/partner authors to stable profile ids', async () => {
    const legacy = JSON.parse(emptyBackup);
    legacy.data.libraryItems = [{ id: 'legacy-item', title: 'Antes', createdBy: 'me', updatedBy: 'partner' }];
    await localStore.importBackup(JSON.stringify(legacy));
    const settings = localStore.get('settings');
    expect(settings.onboardingStage).toBe('complete');
    expect(settings.activeProfileId).toBe(settings.profiles.primary.id);
    expect(settings.profiles.primary.id).toMatch(/^profile-/);
    expect(localStore.get('libraryItems')[0]).toMatchObject({
      createdBy: settings.profiles.primary.id,
      updatedBy: settings.profiles.partner.id,
    });
  });

  it('creates a pending idea without a phantom plan', async () => {
    const result = await new LocalActivityRepository().register({ spaceId: 'local-space', mode: 'later', title: 'Zelda', kind: 'video_game' });
    expect(result.plan).toBeNull();
    expect(localStore.get('libraryItems')).toHaveLength(1);
    expect(localStore.get('plans')).toHaveLength(0);
  });

  it('completes an existing pending activity without duplicating it', async () => {
    const activity = await new LocalActivityRepository().register({ spaceId: 'local-space', mode: 'later', title: 'Zelda', kind: 'video_game' });
    const occurrence = await new LocalPlanRepository().recordCompletedActivity(activity.item.id);
    expect(occurrence).toMatchObject({ libraryItemId: activity.item.id, status: 'completed' });
    expect(localStore.get('libraryItems')).toHaveLength(1);
    expect(localStore.get('plans')).toHaveLength(1);
    expect(localStore.get('libraryItems')[0].status).toBe('completed');
  });

  it('reuses a planned occurrence when completing an activity', async () => {
    const activity = await new LocalActivityRepository().register({ spaceId: 'local-space', mode: 'later', title: 'Cena', kind: 'other' });
    const plans = new LocalPlanRepository();
    const plan = await plans.create({ spaceId: 'local-space', title: 'Viernes', libraryItemIds: [activity.item.id] });
    const occurrence = await plans.recordCompletedActivity(activity.item.id);
    expect(occurrence.id).toBe(plan.items[0].id);
    expect(localStore.get('plans')).toHaveLength(1);
  });

  it('saves, deduplicates and attaches shared music', async () => {
    const activity = await new LocalActivityRepository().register({ spaceId: 'local-space', mode: 'memory', title: 'Viaje', kind: 'other' });
    const music = new LocalMusicLibraryRepository();
    const input = { spaceId: 'local-space', provider: 'spotify' as const, providerId: 'abc', entityType: 'track' as const, title: 'Midnight', externalUrl: 'https://open.spotify.com/track/abc' };
    const first = await music.save(input);
    const duplicate = await music.save(input);
    expect(duplicate.id).toBe(first.id);
    expect(first.spotifyUri).toBe('spotify:track:abc');
    expect(await music.list('local-space')).toHaveLength(1);
    await music.attach(activity.planItem!.id, first.id);
    expect((await new LocalReviewRepository().getForPlanItem(activity.planItem!.id)).track?.savedMusicItemId).toBe(first.id);
    const backup = await localStore.exportBackup();
    expect(backup.manifest.counts.savedMusic).toBe(1);
    await localStore.importBackup(backup.contents);
    expect(await music.list('local-space')).toHaveLength(1);
    await music.remove(first.id);
    expect(await music.list('local-space')).toHaveLength(0);
  });

  it('registers a complete memory atomically with its review and song', async () => {
    const result = await new LocalActivityRepository().register({ spaceId: 'local-space', mode: 'memory', title: 'Arrival', kind: 'movie', rating: 5, comment: 'Hermosa', song: 'https://open.spotify.com/track/example' });
    expect(result.plan?.status).toBe('completed');
    expect(localStore.get('reviews')).toHaveLength(1);
    expect(localStore.get('memoryTracks')).toHaveLength(1);
  });

  it('does not expose partial memory state when persistence fails', async () => {
    failNextWrite = true;
    await expect(new LocalActivityRepository().register({
      spaceId: 'local-space',
      mode: 'memory',
      title: 'No debe aparecer',
      kind: 'movie',
      rating: 4,
      song: 'Una canción',
    })).rejects.toThrow('Disk full');
    expect(localStore.get('libraryItems')).toHaveLength(0);
    expect(localStore.get('plans')).toHaveLength(0);
    expect(localStore.get('reviews')).toHaveLength(0);
    expect(localStore.get('memoryTracks')).toHaveLength(0);
  });

  it('replaces and removes the single associated track', async () => {
    const activity = await new LocalActivityRepository().register({ spaceId: 'local-space', mode: 'memory', title: 'Viaje', kind: 'other' });
    const reviews = new LocalReviewRepository();
    await reviews.setTrack(activity.planItem!.id, 'Primera');
    await reviews.setTrack(activity.planItem!.id, 'Segunda');
    expect((await reviews.getForPlanItem(activity.planItem!.id)).track?.title).toBe('Segunda');
    await reviews.removeTrack(activity.planItem!.id);
    expect((await reviews.getForPlanItem(activity.planItem!.id)).track).toBeNull();
  });

  it('stores normalized Spotify metadata without credentials', async () => {
    const activity = await new LocalActivityRepository().register({ spaceId: 'local-space', mode: 'memory', title: 'Viaje', kind: 'other' });
    const reviews = new LocalReviewRepository();
    await reviews.setSpotifyTrack(activity.planItem!.id, {
      id: 'spotify-track-1', uri: 'spotify:track:spotify-track-1', title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We’re Dreaming', durationMs: 244_000, artworkUrl: 'data:image/png;base64,AA==', externalUrl: 'https://open.spotify.com/track/spotify-track-1',
    });
    const track = (await reviews.getForPlanItem(activity.planItem!.id)).track;
    expect(track).toMatchObject({ externalId: 'spotify-track-1', artist: 'M83', album: 'Hurry Up, We’re Dreaming' });
    const backup = await localStore.exportBackup();
    expect(backup.contents).not.toContain('access_token');
    expect(backup.contents).not.toContain('refresh_token');
  });

  it('hydrates controller and motion defaults for legacy settings', async () => {
    const settings = await new LocalSettingsRepository().get();
    expect(settings.motionMode).toBe('system');
    expect(settings.controllerNavigationEnabled).toBe(true);
    expect(settings.controllerMapping.confirm.index).toBe(0);
  });

  it('migrates the legacy shared avatar to the main profile', async () => {
    const legacy = JSON.parse(emptyBackup);
    legacy.data.settings.avatarDataUrl = 'data:image/png;base64,AA==';
    await localStore.importBackup(JSON.stringify(legacy));
    const settings = await new LocalSettingsRepository().get();
    expect(settings.userAvatarUrl).toBe('data:image/png;base64,AA==');
    expect(settings.partnerAvatarUrl).toBeNull();
  });

  it('validates imports before replacing data', async () => {
    const settings = new LocalSettingsRepository();
    await expect(settings.previewImport('{broken')).rejects.toThrow('JSON válido');
    expect((await settings.previewImport(emptyBackup)).manifest.counts.libraryItems).toBe(0);
  });

  it('reclassifies activities when their custom category is removed', async () => {
    const settings = new LocalSettingsRepository();
    const updated = await settings.addCategory({ label: 'Juegos de mesa', icon: '🎲', colorHex: '#10B981' });
    const category = updated.customCategories[0];
    await new LocalActivityRepository().register({
      spaceId: 'local-space',
      mode: 'later',
      title: 'Azul',
      kind: 'custom',
      customCategoryId: category.id,
    });
    expect(await settings.categoryUsage(category.id)).toBe(1);
    const result = await settings.removeCategory(category.id);
    expect(result.reclassifiedCount).toBe(1);
    expect(localStore.get('libraryItems')[0]).toMatchObject({ kind: 'other', customCategoryId: null });
  });

  it('archives and restores an activity without deleting it', async () => {
    const created = await new LocalActivityRepository().register({ spaceId: 'local-space', mode: 'later', title: 'Celeste', kind: 'video_game' });
    const library = new LocalLibraryRepository();
    await library.archive(created.item.id);
    expect(await library.get(created.item.id)).toMatchObject({ archivedAt: expect.any(String) });
    expect((await library.list('local-space')).items).toHaveLength(0);
    await library.restore(created.item.id);
    expect(await library.get(created.item.id)).toMatchObject({ archivedAt: null });
  });

  it('keeps plan and activity statuses consistent when cancelling', async () => {
    const activity = await new LocalActivityRepository().register({ spaceId: 'local-space', mode: 'later', title: 'Cena', kind: 'other' });
    const plans = new LocalPlanRepository();
    const plan = await plans.create({ spaceId: 'local-space', title: 'Viernes', libraryItemIds: [activity.item.id] });
    expect(localStore.get('libraryItems')[0].status).toBe('planned');
    await plans.start(plan.id);
    expect(localStore.get('libraryItems')[0].status).toBe('in_progress');
    await plans.cancel(plan.id);
    expect((await plans.get(plan.id))?.status).toBe('cancelled');
    expect(localStore.get('libraryItems')[0].status).toBe('pending');
  });

  it('starts a plan and its persisted session in one atomic write', async () => {
    const activity = await new LocalActivityRepository().register({ spaceId: 'local-space', mode: 'later', title: 'Noche de juego', kind: 'video_game' });
    const plans = new LocalPlanRepository();
    const plan = await plans.create({ spaceId: 'local-space', title: 'Sábado', libraryItemIds: [activity.item.id] });
    failNextWrite = true;
    await expect(plans.start(plan.id)).rejects.toThrow('Disk full');
    expect((await plans.get(plan.id))?.status).not.toBe('in_progress');
    expect(localStore.get('sessions')).toHaveLength(0);
    const session = await plans.start(plan.id);
    expect(session.currentPlanItemId).toBe(plan.items[0].id);
    expect(localStore.get('sessions')).toHaveLength(1);
  });

  it('edits plan items and ends the session only after memories are registered', async () => {
    const activities = new LocalActivityRepository();
    const first = await activities.register({ spaceId: 'local-space', mode: 'later', title: 'Primera', kind: 'movie' });
    const second = await activities.register({ spaceId: 'local-space', mode: 'later', title: 'Segunda', kind: 'series' });
    const plans = new LocalPlanRepository();
    const plan = await plans.create({ spaceId: 'local-space', title: 'Maratón', libraryItemIds: [first.item.id] });
    const edited = await plans.update(plan.id, { title: 'Maratón editada', notes: 'Con palomitas', libraryItemIds: [first.item.id, second.item.id] });
    expect(edited.items).toHaveLength(2);
    await plans.start(plan.id);
    await plans.completeItem(edited.items[0].id);
    expect((await plans.get(plan.id))?.status).toBe('in_progress');
    expect(localStore.get('sessions')[0].currentPlanItemId).toBe(edited.items[1].id);
    await plans.completeItem(edited.items[1].id);
    expect((await plans.get(plan.id))?.status).toBe('completed');
    expect(localStore.get('sessions')[0]).toMatchObject({ status: 'ended', currentPlanItemId: null });
  });

  it('lists archived activities separately for recovery', async () => {
    const created = await new LocalActivityRepository().register({ spaceId: 'local-space', mode: 'later', title: 'Archivada', kind: 'other' });
    const library = new LocalLibraryRepository();
    await library.archive(created.item.id);
    expect((await library.list('local-space', { onlyArchived: true })).items.map((item) => item.id)).toEqual([created.item.id]);
  });

  it('marks unknown library routes instead of showing all data', () => {
    expect(resolveSection('does-not-exist', []).isKnown).toBe(false);
  });
});
