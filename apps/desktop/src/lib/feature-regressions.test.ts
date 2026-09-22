import { describe, expect, it } from 'vitest';
import {
  categoryTextColor,
  configureLocalMediaPersistence,
  isSingleEmoji,
  normalizeCategoryColor,
  validateCategoryInput,
} from '@proyecto-noche/domain';
import { cacheCoverAsset } from './cache-cover';
import { spotifyEmbedUrl } from './spotify-embed';
import { activityTypeForSection, newActivityPath } from '../features/library/new-activity-route';
import { collapsedReview, completedDateLabel } from '../features/memories/review-display';
import { useUiStore } from '../stores/ui-store';
import type { SavedMusicItem } from '@proyecto-noche/domain';
import { defaultAppearance, sectionKeyFromPath } from './section-theme';
import { profileInitial } from './profile-avatar';
import { upcomingPlanReminders } from '../hooks/use-notifications';
import type { Plan } from '@proyecto-noche/domain';

describe('music reliability', () => {
  it('requests playback on every music-card activation, including the selected item', () => {
    const item: SavedMusicItem = {
      id: 'local-song', spaceId: 'local-space', provider: 'local', providerId: null,
      spotifyUri: null, entityType: 'audio', title: 'Canción', artist: null,
      artworkUrl: null, artworkStoragePath: null, externalUrl: null,
      localStoragePath: 'media/music/song.mp3', localUrl: 'asset://song.mp3',
      mimeType: 'audio/mpeg', durationMs: null, createdBy: 'me', createdAt: new Date(0).toISOString(),
    };
    const before = useUiStore.getState().musicPlayRequest;
    useUiStore.getState().selectMusicItem(item);
    useUiStore.getState().selectMusicItem(item);
    expect(useUiStore.getState()).toMatchObject({
      musicSelectedId: item.id,
      musicMinimized: false,
      musicPlayRequest: before + 2,
    });
  });

  it('keeps the remote artwork URL when native caching fails asynchronously', async () => {
    configureLocalMediaPersistence({
      async importDataUrl() { throw new Error('not used'); },
      async importRemoteUrl() { await Promise.resolve(); throw new Error('network unavailable'); },
      async resolve() { throw new Error('not used'); },
      async remove() {},
    });
    await expect(cacheCoverAsset('https://i.scdn.co/image/example', 'spotify')).resolves.toEqual({ storagePath: '', resolvedUrl: 'https://i.scdn.co/image/example' });
  });

  it('builds embeds only from normalized Spotify identities', () => {
    expect(spotifyEmbedUrl({ provider: 'spotify', providerId: 'abc123', spotifyUri: 'spotify:playlist:abc123', entityType: 'playlist', externalUrl: 'https://open.spotify.com/playlist/abc123' })).toBe('https://open.spotify.com/embed/playlist/abc123?utm_source=noite');
    expect(spotifyEmbedUrl({ provider: 'spotify', providerId: null, spotifyUri: null, entityType: 'track', externalUrl: 'https://open.spotify.com.evil.example/track/abc123' })).toBeNull();
  });
});

describe('activity detail presentation', () => {
  it('keeps 250 graphemes whole and truncates only the 251st', () => {
    expect(collapsedReview('a'.repeat(250), false)).toEqual({ text: 'a'.repeat(250), truncated: false });
    expect(collapsedReview(`${'a'.repeat(249)}👩🏽‍💻b`, false)).toEqual({
      text: `${'a'.repeat(249)}👩🏽‍💻…`,
      truncated: true,
    });
    expect(collapsedReview(`${'a'.repeat(249)}👩🏽‍💻b`, true).text).toBe(`${'a'.repeat(249)}👩🏽‍💻b`);
  });

  it('formats valid completion dates and never invents a legacy date', () => {
    expect(completedDateLabel(null)).toBe('Fecha no registrada');
    expect(completedDateLabel('not-a-date')).toBe('Fecha no registrada');
    expect(completedDateLabel('2026-08-10T12:00:00.000Z')).toContain('2026');
  });
});

describe('custom category presentation', () => {
  it('hydrates legacy colors and chooses readable text', () => {
    expect(normalizeCategoryColor('bg-amber-500')).toBe('#F59E0B');
    expect(categoryTextColor('#FFFFFF')).toBe('#111827');
    expect(categoryTextColor('#111827')).toBe('#FFFFFF');
  });

  it('accepts compound emoji and rejects more than one grapheme', () => {
    expect(isSingleEmoji('👩🏽‍💻')).toBe(true);
    expect(isSingleEmoji('🎮🎬')).toBe(false);
    expect(validateCategoryInput({ label: '  Viajes  ', icon: '🏳️‍🌈', colorHex: '#123ABC' })).toEqual({
      label: 'Viajes', icon: '🏳️‍🌈', colorHex: '#123ABC',
    });
  });
});

describe('new activity context', () => {
  const custom = [{ id: 'recetas', label: 'Recetas', icon: '🍲', colorHex: '#F59E0B' }];
  it('maps built-in and custom sections while leaving non-category pages blank', () => {
    expect(activityTypeForSection('juegos', custom)).toBe('video_game');
    expect(activityTypeForSection('peliculas', custom)).toBe('movie');
    expect(activityTypeForSection('series', custom)).toBe('series');
    expect(activityTypeForSection('recetas', custom)).toBe('custom:recetas');
    expect(activityTypeForSection('favoritos', custom)).toBe('');
    expect(activityTypeForSection(null, custom)).toBe('');
  });

  it('encodes section-aware activity routes without assigning Favorites a type', () => {
    expect(newActivityPath('juegos')).toBe('/actividades/nueva?section=juegos');
    expect(newActivityPath('favoritos')).toBe('/actividades/nueva');
    expect(newActivityPath(null, true)).toBe('/actividades/nueva?from=plan');
  });
});

describe('light defaults and resilient avatars', () => {
  it('uses light defaults while retaining an explicit dark option and registration detail theming', () => {
    expect(defaultAppearance('home')).toMatchObject({ accent: '#a855f7', dark: false });
    expect(defaultAppearance('home', undefined, 'light')).toMatchObject({ accent: '#a855f7', dark: false });
    expect(defaultAppearance('home', undefined, 'dark')).toMatchObject({ dark: true });
    expect(defaultAppearance('peliculas')).toMatchObject({ accent: '#ef3340', dark: false });
    expect(defaultAppearance('custom-id', '#12AB34')).toMatchObject({ accent: '#12AB34', dark: false });
    expect(sectionKeyFromPath('/biblioteca/nueva')).toBe('item');
    expect(sectionKeyFromPath('/actividades/nueva')).toBe('item');
  });

  it('takes the first complete Unicode character for the avatar fallback', () => {
    expect(profileInitial('  álex')).toBe('Á');
    expect(profileInitial('𝔘rsula')).toBe('𝔘');
  });
});

describe('plan reminders', () => {
  it('excludes completed and cancelled plans immediately', () => {
    const base = { spaceId: 'local-space', title: 'Plan', startsAt: '2030-01-01T00:00:00.000Z', items: [] } as unknown as Plan;
    const plans = [
      { ...base, id: 'active', status: 'scheduled' },
      { ...base, id: 'completed', status: 'completed' },
      { ...base, id: 'cancelled', status: 'cancelled' },
    ] as Plan[];
    expect(upcomingPlanReminders(plans, 0).map((plan) => plan.id)).toEqual(['active']);
  });
});
