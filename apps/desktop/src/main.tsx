import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { configureLocalMediaPersistence, configureLocalPersistence, localStore } from '@proyecto-noche/domain';
import { nativePersistence } from './lib/native-persistence';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import '@fontsource-variable/geist';
import '@fontsource/space-mono/700.css';
import { nativeMediaPersistence } from './lib/native-media';
import { RecoveryScreen } from './components/ui/RecoveryScreen';
import { readStartupState, withStartupTimeout } from './lib/startup-persistence';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<main className="grid h-dvh place-items-center bg-noche-bg text-noche-text"><p role="status">Abriendo Noite…</p></main>);

async function migrateLegacyMedia(state: Record<string, unknown>) {
  const changed: Record<string, unknown> = {};
  const libraryItems = Array.isArray(state.libraryItems) ? await Promise.all(state.libraryItems.map(async (raw) => {
    const item = raw as Record<string, unknown>;
    if (typeof item.customCoverPath === 'string' && item.customCoverPath.startsWith('media/')) {
      const coverUrl = await nativeMediaPersistence.resolve(item.customCoverPath).catch(() => item.coverUrl as string);
      return coverUrl === item.coverUrl ? item : { ...item, coverUrl };
    }
    if (typeof item.coverUrl !== 'string' || !item.coverUrl.startsWith('data:image/')) return item;
    const media = await nativeMediaPersistence.importDataUrl('covers', item.coverUrl);
    return { ...item, coverUrl: media.resolvedUrl, customCoverPath: media.storagePath };
  })) : null;
  if (libraryItems && libraryItems.some((item, index) => item !== (state.libraryItems as unknown[])[index])) changed.libraryItems = libraryItems;

  const attachments = Array.isArray(state.attachments) ? await Promise.all(state.attachments.map(async (raw) => {
    const item = raw as Record<string, unknown>;
    if (typeof item.storagePath === 'string' && item.storagePath.startsWith('media/')) {
      const resolvedUrl = await nativeMediaPersistence.resolve(item.storagePath).catch(() => item.resolvedUrl as string);
      return resolvedUrl === item.resolvedUrl ? item : { ...item, resolvedUrl };
    }
    if (typeof item.resolvedUrl !== 'string' || !item.resolvedUrl.startsWith('data:image/')) return item;
    const media = await nativeMediaPersistence.importDataUrl('captures', item.resolvedUrl);
    return { ...item, storagePath: media.storagePath, resolvedUrl: media.resolvedUrl };
  })) : null;
  if (attachments && attachments.some((item, index) => item !== (state.attachments as unknown[])[index])) changed.attachments = attachments;

  const memoryTracks = Array.isArray(state.memoryTracks) ? await Promise.all(state.memoryTracks.map(async (raw) => {
    const track = raw as Record<string, unknown>;
    if (typeof track.cachedArtworkPath === 'string' && track.cachedArtworkPath.startsWith('media/')) {
      const coverUrl = await nativeMediaPersistence.resolve(track.cachedArtworkPath).catch(() => track.coverUrl as string);
      return coverUrl === track.coverUrl ? track : { ...track, coverUrl };
    }
    if (typeof track.coverUrl !== 'string' || !track.coverUrl.startsWith('data:image/')) return track;
    const media = await nativeMediaPersistence.importDataUrl('spotify', track.coverUrl);
    return { ...track, coverUrl: media.resolvedUrl, cachedArtworkPath: media.storagePath };
  })) : null;
  if (memoryTracks && memoryTracks.some((item, index) => item !== (state.memoryTracks as unknown[])[index])) changed.memoryTracks = memoryTracks;

  const savedMusicItems = Array.isArray(state.savedMusicItems) ? await Promise.all(state.savedMusicItems.map(async (raw) => {
    const item = raw as Record<string, unknown>;
    let next = item;
    if (typeof item.localStoragePath === 'string' && item.localStoragePath.startsWith('media/')) {
      const localUrl = await nativeMediaPersistence.resolve(item.localStoragePath).catch(() => item.localUrl as string);
      if (localUrl !== item.localUrl) next = { ...next, localUrl };
    }
    if (typeof item.artworkStoragePath === 'string' && item.artworkStoragePath.startsWith('media/')) {
      const artworkUrl = await nativeMediaPersistence.resolve(item.artworkStoragePath).catch(() => item.artworkUrl as string);
      if (artworkUrl !== item.artworkUrl) next = { ...next, artworkUrl };
    }
    return next;
  })) : null;
  if (savedMusicItems && savedMusicItems.some((item, index) => item !== (state.savedMusicItems as unknown[])[index])) changed.savedMusicItems = savedMusicItems;

  if (state.settings && typeof state.settings === 'object') {
    const settings = state.settings as Record<string, unknown>;
    let nextSettings = settings;
    const legacyAvatarPath = settings.userAvatarPath ?? settings.avatarPath;
    const legacyAvatarUrl = settings.userAvatarUrl ?? settings.avatarDataUrl;
    if (typeof legacyAvatarPath === 'string' && legacyAvatarPath.startsWith('media/')) {
      const userAvatarUrl = await nativeMediaPersistence.resolve(legacyAvatarPath).catch(() => null);
      if (userAvatarUrl !== settings.userAvatarUrl) nextSettings = { ...nextSettings, userAvatarUrl, userAvatarPath: legacyAvatarPath };
    } else if (typeof legacyAvatarUrl === 'string' && legacyAvatarUrl.startsWith('data:image/')) {
      const media = await nativeMediaPersistence.importDataUrl('profiles', legacyAvatarUrl);
      nextSettings = { ...nextSettings, userAvatarUrl: media.resolvedUrl, userAvatarPath: media.storagePath };
    }
    for (const actor of ['user', 'partner'] as const) {
      const pathKey = `${actor}AvatarPath`;
      const urlKey = `${actor}AvatarUrl`;
      const path = nextSettings[pathKey];
      if (typeof path === 'string' && path.startsWith('media/')) {
        const resolved = await nativeMediaPersistence.resolve(path).catch(() => nextSettings[urlKey] as string);
        if (resolved !== nextSettings[urlKey]) nextSettings = { ...nextSettings, [urlKey]: resolved };
      }
    }
    if (settings.sectionAppearances && typeof settings.sectionAppearances === 'object') {
      const appearances = { ...(settings.sectionAppearances as Record<string, Record<string, unknown>>) };
      let appearancesChanged = false;
      for (const [key, appearance] of Object.entries(appearances)) {
        if (typeof appearance.backgroundImageStoragePath === 'string' && appearance.backgroundImageStoragePath.startsWith('media/')) {
          const backgroundImagePath = await nativeMediaPersistence.resolve(appearance.backgroundImageStoragePath).catch(() => appearance.backgroundImagePath as string);
          if (backgroundImagePath !== appearance.backgroundImagePath) { appearances[key] = { ...appearance, backgroundImagePath }; appearancesChanged = true; }
        } else if (typeof appearance.backgroundImagePath === 'string' && appearance.backgroundImagePath.startsWith('data:image/')) {
          const media = await nativeMediaPersistence.importDataUrl('backgrounds', appearance.backgroundImagePath);
          appearances[key] = { ...appearance, backgroundImagePath: media.resolvedUrl, backgroundImageStoragePath: media.storagePath };
          appearancesChanged = true;
        }
      }
      if (appearancesChanged) nextSettings = { ...nextSettings, sectionAppearances: appearances };
    }
    if (nextSettings !== settings) changed.settings = nextSettings;
  }
  if (Object.keys(changed).length) await nativePersistence.setMany(changed);
}

async function bootstrap() {
  if ('__TAURI_INTERNALS__' in window) {
    // One-time bridge from the previous IndexedDB release. The legacy copy is
    // deliberately retained until the native write has succeeded.
    const { nativeState, legacyState } = await withStartupTimeout(readStartupState(
      () => nativePersistence.getAll(), () => localStore.debugDump(),
    ));
    const sourceState = Object.keys(nativeState).length === 0 && Object.keys(legacyState).length > 0 ? legacyState : nativeState;
    const sourceSettings = sourceState.settings as { setupVersion?: number } | undefined;
    if ((sourceSettings?.setupVersion ?? 0) < 2) await import('@tauri-apps/api/core').then(({ invoke }) => invoke('clear_legacy_spotify_credentials')).catch(() => undefined);
    if (Object.keys(nativeState).length === 0 && Object.keys(legacyState).length > 0) {
      await nativePersistence.setMany(legacyState);
      await migrateLegacyMedia(legacyState);
    } else {
      await migrateLegacyMedia(nativeState);
    }
    configureLocalPersistence(nativePersistence);
    configureLocalMediaPersistence(nativeMediaPersistence);
  }

  root.render(
    <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>
  );
}

void bootstrap().catch((error) => {
  console.error('No se pudo iniciar Noite', error);
  root.render(<RecoveryScreen />);
});
