import { invoke } from './invoke';
import type { LocalPersistenceAdapter } from '@proyecto-noche/domain';
import { nativeMediaPersistence } from './native-media';

let statePromise: Promise<Record<string, unknown>> | null = null;

async function loadState() {
  statePromise ??= invoke<Record<string, unknown>>('load_state').then(hydrateMediaUrls).catch((cause) => {
    statePromise = null;
    throw cause;
  });
  return statePromise;
}

async function hydrateMediaUrls(state: Record<string, unknown>) {
  const resolve = async (path: unknown) => typeof path === 'string' && path.startsWith('media/') ? nativeMediaPersistence.resolve(path).catch(() => null) : null;
  const next = { ...state };
  if (Array.isArray(state.libraryItems)) next.libraryItems = await Promise.all(state.libraryItems.map(async (raw) => { const item = raw as Record<string, unknown>; const coverUrl = await resolve(item.customCoverPath); return coverUrl ? { ...item, coverUrl } : item; }));
  if (Array.isArray(state.attachments)) next.attachments = await Promise.all(state.attachments.map(async (raw) => { const item = raw as Record<string, unknown>; const resolvedUrl = await resolve(item.storagePath); return resolvedUrl ? { ...item, resolvedUrl } : item; }));
  if (Array.isArray(state.memoryTracks)) next.memoryTracks = await Promise.all(state.memoryTracks.map(async (raw) => { const item = raw as Record<string, unknown>; const coverUrl = await resolve(item.cachedArtworkPath); return coverUrl ? { ...item, coverUrl } : item; }));
  if (Array.isArray(state.savedMusicItems)) next.savedMusicItems = await Promise.all(state.savedMusicItems.map(async (raw) => { const item = raw as Record<string, unknown>; const [localUrl, artworkUrl] = await Promise.all([resolve(item.localStoragePath), resolve(item.artworkStoragePath)]); return localUrl || artworkUrl ? { ...item, ...(localUrl ? { localUrl } : {}), ...(artworkUrl ? { artworkUrl } : {}) } : item; }));
  return next;
}

export function invalidateNativePersistenceCache() {
  statePromise = null;
}

export const nativePersistence: LocalPersistenceAdapter = {
  async get<T>(key: string) {
    return (await loadState())[key] as T | undefined;
  },
  async setMany(entries, clearFirst = false) {
    await invoke(clearFirst ? 'replace_state' : 'commit_state', { entries });
    const current = clearFirst ? {} : await loadState();
    statePromise = Promise.resolve({ ...current, ...entries });
    window.dispatchEvent(new CustomEvent('local-state-committed'));
  },
  async getAll() {
    return { ...(await loadState()) };
  },
};

export interface NativeBackupInfo { id: number; createdAt: string }

export function listNativeBackups() {
  return invoke<NativeBackupInfo[]>('list_backups');
}

export async function restoreNativeBackup(id: number) {
  await invoke('restore_backup', { backupId: id });
}

export interface NativeArchiveManifest {
  coupleNames?: [string, string] | null;
  format: 'noche'; version: 2 | 3 | 4 | 5; exportedAt: string; appVersion?: string; schemaVersion?: number;
  counts: { libraryItems: number; plans: number; reviews: number; tracks: number; savedMusic?: number; attachments: number; mediaFiles: number; passwordVaultEntries?: number };
}
export interface NativeArchivePreview { manifest: NativeArchiveManifest; warnings: string[] }
export function chooseNativeArchiveExportPath() { return invoke<string | null>('choose_noche_export_path'); }
export function chooseNativeArchiveImportPath() { return invoke<string | null>('choose_noche_import_path'); }
export function exportNativeArchiveToPath(path: string, password: string) { return invoke<{ manifest: NativeArchiveManifest; path: string }>('export_noche_archive_file', { path, password }); }
export function previewNativeArchivePath(path: string, password: string) { return invoke<NativeArchivePreview>('preview_noche_archive_file', { path, password }); }
export async function importNativeArchivePath(path: string, password: string) { await invoke('import_noche_archive_file', { path, password }); }
export async function openNativeArchiveFolder(path: string) { await invoke('open_backup_folder', { path }); }
