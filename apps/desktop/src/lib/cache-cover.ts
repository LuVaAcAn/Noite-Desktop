import { persistLocalMedia, persistRemoteMedia, type MediaCategory, type PersistedMedia } from '@proyecto-noche/domain';

export async function cacheLocalImage(dataUrl: string, category: MediaCategory = 'covers', fileName?: string): Promise<string> {
  return (await cacheLocalImageAsset(dataUrl, category, fileName)).resolvedUrl;
}

export function cacheLocalImageAsset(dataUrl: string, category: MediaCategory = 'covers', fileName?: string) { return persistLocalMedia(category, dataUrl, fileName); }

export async function cacheCoverAsset(url: string | null, category: MediaCategory = 'covers'): Promise<PersistedMedia | null> {
  if (!url) return null;
  try {
    if (!url.startsWith('data:')) return await persistRemoteMedia(category, url);
    return await persistLocalMedia(category, url);
  } catch { return { storagePath: '', resolvedUrl: url }; }
}

export async function cacheCoverUrl(url: string | null): Promise<string | null> {
  return (await cacheCoverAsset(url))?.resolvedUrl ?? null;
}
