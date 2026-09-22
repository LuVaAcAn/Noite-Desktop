import { idbGet, idbGetAllEntries, idbSet, idbSetMany } from './local-db';
import { deviceProfileId } from './device-profile';
import { DEFAULT_LOCAL_SETTINGS, type CustomCategory, type LocalSettings, type Profile } from '../entities/local-settings';
import { normalizeCategoryColor } from '../entities/category-utils';
import type { LibraryItem } from '../entities/library-item';
import type { Plan } from '../entities/plan';
import type { Review, SharedReview } from '../entities/review';
import type { Attachment, MemoryTrack, Session } from '../entities/memory';
import type { SavedMusicItem } from '../entities/saved-music';
import type { BackupCounts, BackupManifest, ExportBackupResult, ImportBackupResult, ImportPreview } from '../repositories/settings-repository';

export interface LocalPersistenceAdapter {
  get<T>(key: string): Promise<T | undefined>;
  setMany(entries: Record<string, unknown>, clearFirst?: boolean): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}

let persistence: LocalPersistenceAdapter = {
  get: idbGet,
  setMany: idbSetMany,
  getAll: idbGetAllEntries,
};

export function configureLocalPersistence(adapter: LocalPersistenceAdapter) {
  persistence = adapter;
}

export const LOCAL_SPACE_ID = 'local-space';

export interface LocalState {
  settings: LocalSettings;
  libraryItems: LibraryItem[];
  plans: Plan[];
  reviews: Review[];
  sharedReviews: SharedReview[];
  memoryTracks: MemoryTrack[];
  savedMusicItems: SavedMusicItem[];
  attachments: Attachment[];
  sessions: Session[];
}

const STATE_KEYS = [
  'settings',
  'libraryItems',
  'plans',
  'reviews',
  'sharedReviews',
  'memoryTracks',
  'savedMusicItems',
  'attachments',
  'sessions',
] as const;

function emptyState(): LocalState {
  return {
    settings: { ...DEFAULT_LOCAL_SETTINGS },
    libraryItems: [],
    plans: [],
    reviews: [],
    sharedReviews: [],
    memoryTracks: [],
    savedMusicItems: [],
    attachments: [],
    sessions: [],
  };
}

function hydrateSettings(value: Partial<LocalSettings> | undefined): LocalSettings {
  const legacy = (value ?? {}) as Partial<LocalSettings> & { activeActorId?: 'me' | 'partner'; lastSpotifyDeviceIds?: unknown; avatarDataUrl?: string | null; avatarPath?: string | null; customCategories?: Array<Partial<CustomCategory> & { colorClass?: string }> };
  const legacyCategories = (legacy.customCategories ?? []) as Array<Partial<CustomCategory> & { colorClass?: string }>;
  const { activeActorId: _legacyActorId, lastSpotifyDeviceIds: _legacySpotifyDevices, avatarDataUrl: _legacyAvatarUrl, avatarPath: _legacyAvatarPath, ...persisted } = legacy;
  const migratingToLocal = value?.localEditionVersion !== 1;
  const sectionAppearances = Object.fromEntries(Object.entries(value?.sectionAppearances ?? {}).map(([key, appearance]) => [key,
    migratingToLocal ? { ...appearance, dark: false, gradientFrom: '#fafaff', gradientTo: '#f0eaff' } : appearance,
  ]));
  const primary = value?.profiles?.primary ?? {
    ...DEFAULT_LOCAL_SETTINGS.profiles.primary,
    displayName: value?.userName ?? '',
    locale: value?.locale ?? 'es',
    avatarUrl: value?.userAvatarUrl ?? legacy.avatarDataUrl ?? null,
  };
  const partner = value?.profiles?.partner ?? {
    ...DEFAULT_LOCAL_SETTINGS.profiles.partner,
    displayName: value?.partnerName ?? '',
    locale: value?.locale ?? 'es',
    avatarUrl: value?.partnerAvatarUrl ?? null,
  };
  const profiles = {
    primary: { ...primary, role: 'primary' as const } satisfies Profile,
    partner: { ...partner, role: 'partner' as const } satisfies Profile,
  };
  // Never adopt the sender's active session when loading a portable backup.
  const activeProfileId = deviceProfileId({ profiles });
  return {
    ...DEFAULT_LOCAL_SETTINGS,
    ...persisted,
    setupVersion: value?.setupVersion ?? (value?.onboardingComplete ? 2 : 0),
    onboardingStage: value?.onboardingStage ?? (value?.onboardingComplete ? 'complete' : 'language'),
    userAvatarUrl: value?.userAvatarUrl ?? legacy.avatarDataUrl ?? null,
    userAvatarPath: value?.userAvatarPath ?? legacy.avatarPath ?? null,
    partnerAvatarUrl: value?.partnerAvatarUrl ?? null,
    partnerAvatarPath: value?.partnerAvatarPath ?? null,
    profiles,
    activeProfileId,
    colorMode: migratingToLocal ? 'light' : value?.colorMode ?? 'light',
    localEditionVersion: 1,
    customCategories: legacyCategories.map((category) => ({
      id: String(category.id ?? ''),
      label: String(category.label ?? 'Categoría'),
      icon: String(category.icon ?? '✨'),
      colorHex: normalizeCategoryColor(category.colorHex ?? category.colorClass),
    })).filter((category) => category.id),
    controllerMapping: {
      ...DEFAULT_LOCAL_SETTINGS.controllerMapping,
      ...value?.controllerMapping,
    },
    audioSettings: {
      ...DEFAULT_LOCAL_SETTINGS.audioSettings,
      ...value?.audioSettings,
    },
    sectionAppearances,
  };
}

const AUTHOR_KEYS = new Set(['createdBy', 'updatedBy', 'uploadedBy', 'userId', 'authorId', 'actorId']);

function migrateActorReferences(value: unknown, settings: LocalSettings): { value: unknown; changed: boolean } {
  let changed = false;
  const visit = (entry: unknown, key?: string): unknown => {
    if (key && AUTHOR_KEYS.has(key) && (entry === 'me' || entry === 'partner')) {
      changed = true;
      return entry === 'me' ? settings.profiles.primary.id : settings.profiles.partner.id;
    }
    if (Array.isArray(entry)) return entry.map((child) => visit(child));
    if (isRecord(entry)) return Object.fromEntries(Object.entries(entry).map(([childKey, child]) => [childKey, visit(child, childKey)]));
    return entry;
  };
  return { value: visit(value), changed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function spotifyUriFor(item: Partial<SavedMusicItem>): string | null {
  if (item.provider !== 'spotify') return null;
  if (typeof item.spotifyUri === 'string' && /^spotify:(track|album|playlist|artist|show|episode):[A-Za-z0-9]+$/.test(item.spotifyUri)) return item.spotifyUri;
  if (item.providerId && item.entityType !== 'audio') return `spotify:${item.entityType}:${item.providerId}`;
  const match = item.externalUrl?.match(/open\.spotify\.com\/(?:intl-[^/]+\/)?(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]+)/);
  return match ? `spotify:${match[1]}:${match[2]}` : null;
}

function hydrateSavedMusic(items: SavedMusicItem[]): SavedMusicItem[] {
  return items.map((item) => ({ ...item, spotifyUri: spotifyUriFor(item) }));
}

function migrateLegacyMusic(state: LocalState): Partial<LocalState> | null {
  if (state.memoryTracks.length === 0) return null;
  const saved = [...state.savedMusicItems];
  let changed = false;
  const tracks = state.memoryTracks.map((track) => {
    if (track.savedMusicItemId && saved.some((item) => item.id === track.savedMusicItemId)) return track;
    const existing = saved.find((item) => item.provider === (track.provider === 'spotify' ? 'spotify' : 'local') && (item.providerId === track.externalId || item.externalUrl === track.externalUrl));
    const item: SavedMusicItem = existing ?? {
      id: `music-legacy-${track.id}`, spaceId: track.spaceId,
      provider: track.provider === 'spotify' ? 'spotify' : 'local', providerId: track.externalId,
      spotifyUri: track.provider === 'spotify' ? track.spotifyUri : null,
      entityType: track.provider === 'spotify' ? 'track' : 'audio', title: track.title,
      artist: track.artist, artworkUrl: track.coverUrl, artworkStoragePath: track.cachedArtworkPath,
      externalUrl: track.provider === 'spotify' ? track.externalUrl : null,
      localStoragePath: null, localUrl: track.provider === 'manual' && track.externalUrl ? track.externalUrl : null,
      mimeType: null, durationMs: track.durationMs, createdBy: track.createdBy, createdAt: track.createdAt,
    };
    if (!existing) saved.push(item);
    changed = true;
    return { ...track, savedMusicItemId: item.id };
  });
  return changed ? { savedMusicItems: saved, memoryTracks: tracks } : null;
}

function parseBackup(json: string): { state: LocalState; preview: ImportPreview } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('El archivo no contiene JSON válido.');
  }
  if (!isRecord(parsed)) throw new Error('El respaldo no tiene un formato válido.');

  const rawManifest = isRecord(parsed.manifest) ? parsed.manifest : null;
  if (rawManifest?.format !== undefined && rawManifest.format !== 'noche') {
    throw new Error('El archivo no es un respaldo de Noite.');
  }
  const version = rawManifest ? Number(rawManifest.version) : ('version' in parsed ? Number(parsed.version) : 1);
  if (version !== 1) throw new Error(`La versión ${version} del respaldo no es compatible.`);
  const data = isRecord(parsed.data) ? parsed.data : parsed;
  if (!isRecord(data.settings)) throw new Error('El respaldo no contiene una configuración válida.');

  const settings = data.settings as unknown as LocalSettings;
  if (typeof settings.onboardingComplete !== 'boolean' || typeof settings.userName !== 'string') {
    throw new Error('La configuración del respaldo está dañada.');
  }

  const next = emptyState();
  next.settings = hydrateSettings(settings);
  const warnings: string[] = [];
  for (const key of STATE_KEYS.filter((key) => key !== 'settings')) {
    const value = data[key];
    if (value === undefined) {
      warnings.push(`El respaldo no incluye ${key}; se importará vacío.`);
      continue;
    }
    if (!Array.isArray(value)) throw new Error(`La colección ${key} no es válida.`);
    (next as unknown as Record<string, unknown>)[key] = value;
  }
  for (const key of STATE_KEYS.filter((key) => key !== 'settings')) {
    const migrated = migrateActorReferences(next[key], next.settings);
    if (migrated.changed) (next as unknown as Record<string, unknown>)[key] = migrated.value;
  }
  next.savedMusicItems = hydrateSavedMusic(next.savedMusicItems);

  for (const item of next.libraryItems) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string') {
      throw new Error('El respaldo contiene una actividad dañada.');
    }
  }
  for (const plan of next.plans) {
    if (!isRecord(plan) || typeof plan.id !== 'string' || !Array.isArray(plan.items)) {
      throw new Error('El respaldo contiene un plan dañado.');
    }
  }

  const counts: BackupCounts = {
    libraryItems: next.libraryItems.length,
    plans: next.plans.length,
    reviews: next.reviews.length,
    tracks: next.memoryTracks.length,
    savedMusic: next.savedMusicItems.length,
    attachments: next.attachments.length,
  };
  return {
    state: next,
    preview: {
      manifest: {
        coupleNames: [next.settings.userName, next.settings.partnerName],
        format: 'noche',
        version,
        exportedAt: typeof rawManifest?.exportedAt === 'string'
          ? rawManifest.exportedAt
          : typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
        counts,
      },
      warnings,
    },
  };
}

class LocalStore {
  private state: LocalState = emptyState();
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  async ensureLoaded(): Promise<LocalState> {
    if (this.loaded) return this.state;
    if (!this.loadingPromise) {
      this.loadingPromise = (async () => {
        const fresh = emptyState();
        for (const key of STATE_KEYS) {
          const stored = await persistence.get<LocalState[typeof key]>(key);
          if (stored !== undefined) {
            (fresh as unknown as Record<string, unknown>)[key] = key === 'settings'
              ? hydrateSettings(stored as LocalSettings)
              : key === 'savedMusicItems' ? hydrateSavedMusic(stored as SavedMusicItem[]) : stored;
          }
        }
        const actorPatch: Partial<LocalState> = {};
        for (const key of STATE_KEYS.filter((key) => key !== 'settings')) {
          const migrated = migrateActorReferences(fresh[key], fresh.settings);
          if (migrated.changed) {
            (fresh as unknown as Record<string, unknown>)[key] = migrated.value;
            (actorPatch as unknown as Record<string, unknown>)[key] = migrated.value;
          }
        }
        const migratedMusic = migrateLegacyMusic(fresh);
        if (migratedMusic) {
          Object.assign(fresh, migratedMusic);
          await persistence.setMany(migratedMusic as Record<string, unknown>);
        }
        await persistence.setMany({ settings: fresh.settings, ...actorPatch });
        this.state = fresh;
        this.loaded = true;
      })();
    }
    await this.loadingPromise;
    return this.state;
  }

  get<K extends keyof LocalState>(key: K): LocalState[K] {
    return this.state[key];
  }

  async set<K extends keyof LocalState>(key: K, value: LocalState[K]): Promise<void> {
    await this.commit({ [key]: value } as Pick<LocalState, K>);
  }

  async commit(patch: Partial<LocalState>): Promise<void> {
    await this.ensureLoaded();
    const operation = this.writeQueue.then(async () => {
      await persistence.setMany(patch as Record<string, unknown>);
      this.state = { ...this.state, ...patch };
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
  }

  async exportBackup(): Promise<ExportBackupResult> {
    await this.ensureLoaded();
    const exportedAt = new Date().toISOString();
    const manifest: BackupManifest = {
      coupleNames: [this.state.settings.userName, this.state.settings.partnerName],
      format: 'noche',
      version: 1,
      exportedAt,
      counts: {
        libraryItems: this.state.libraryItems.length,
        plans: this.state.plans.length,
        reviews: this.state.reviews.length,
        tracks: this.state.memoryTracks.length,
        savedMusic: this.state.savedMusicItems.length,
        attachments: this.state.attachments.length,
      },
    };
    return {
      manifest,
      contents: JSON.stringify({ manifest, data: this.state }, null, 2),
      suggestedFileName: `noite-${exportedAt.slice(0, 10)}.noche`,
    };
  }

  previewImport(json: string): ImportPreview {
    return parseBackup(json).preview;
  }

  async importBackup(json: string): Promise<ImportBackupResult> {
    await this.ensureLoaded();
    const { state: next, preview } = parseBackup(json);
    const recoveryBackup = (await this.exportBackup()).contents;
    const entries: Record<string, unknown> = { recoveryBackup };
    STATE_KEYS.forEach((key) => (entries[key] = next[key]));

    const operation = this.writeQueue.then(async () => {
      await persistence.setMany(entries, true);
      this.state = next;
      this.loaded = true;
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
    return { manifest: preview.manifest, recoveryBackupCreated: true };
  }

  async debugDump(): Promise<Record<string, unknown>> {
    return persistence.getAll();
  }

  async reload(): Promise<LocalState> {
    await this.writeQueue;
    this.loaded = false;
    this.loadingPromise = null;
    return this.ensureLoaded();
  }

  async saveRecoveryBackup(): Promise<void> {
    await idbSet('recoveryBackup', (await this.exportBackup()).contents);
  }
}

export const localStore = new LocalStore();
