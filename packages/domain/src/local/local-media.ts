export type MediaCategory = 'covers' | 'captures' | 'profiles' | 'spotify' | 'backgrounds';

export interface PersistedMedia {
  storagePath: string;
  resolvedUrl: string;
}

export interface LocalMediaPersistenceAdapter {
  importDataUrl(category: MediaCategory, dataUrl: string, fileName?: string): Promise<PersistedMedia>;
  importRemoteUrl(category: MediaCategory, url: string): Promise<PersistedMedia>;
  resolve(storagePath: string): Promise<string>;
  remove(storagePath: string): Promise<void>;
}

let adapter: LocalMediaPersistenceAdapter = {
  async importDataUrl(_category, dataUrl) { return { storagePath: 'browser-preview', resolvedUrl: dataUrl }; },
  async importRemoteUrl(_category, url) { return { storagePath: '', resolvedUrl: url }; },
  async resolve(storagePath) { return storagePath; },
  async remove() {},
};

export function configureLocalMediaPersistence(next: LocalMediaPersistenceAdapter) { adapter = next; }
export function persistLocalMedia(category: MediaCategory, dataUrl: string, fileName?: string) { return adapter.importDataUrl(category, dataUrl, fileName); }
export function persistRemoteMedia(category: MediaCategory, url: string) { return adapter.importRemoteUrl(category, url); }
export function resolveLocalMedia(storagePath: string) { return adapter.resolve(storagePath); }
export function removeLocalMedia(storagePath: string) { return adapter.remove(storagePath); }
