import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from './invoke';
import type { LocalMediaPersistenceAdapter, MediaCategory, PersistedMedia } from '@proyecto-noche/domain';

interface NativeMediaResult { storagePath: string; absolutePath: string }
interface NativeAudioResult extends NativeMediaResult { mimeType: string }
interface NativeOptimizedImage { dataUrl: string; sha256: string; sizeBytes: number }

export const nativeMediaPersistence: LocalMediaPersistenceAdapter = {
  async importDataUrl(category: MediaCategory, dataUrl: string, fileName?: string): Promise<PersistedMedia> {
    const result = await invoke<NativeMediaResult>('import_media_data_url', { category, dataUrl, fileName });
    return { storagePath: result.storagePath, resolvedUrl: convertFileSrc(result.absolutePath) };
  },
  async importRemoteUrl(category: MediaCategory, url: string): Promise<PersistedMedia> {
    const result = await invoke<NativeMediaResult>('import_media_remote_url', { category, url });
    return { storagePath: result.storagePath, resolvedUrl: convertFileSrc(result.absolutePath) };
  },
  async resolve(storagePath: string) {
    const absolute = await invoke<string>('resolve_media_path', { storagePath });
    return convertFileSrc(absolute);
  },
  async remove(storagePath: string) { await invoke('remove_media', { storagePath }); },
};

export const optimizeNativeImage = (dataUrl: string) => invoke<NativeOptimizedImage>('optimize_image_data_url', { dataUrl });
export const readNativeMediaDataUrl = (storagePath: string) => invoke<string>('read_media_data_url', { storagePath });
export async function importLocalAudio(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeByExtension: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg' };
  const normalizedMime = mimeByExtension[extension];
  if (!normalizedMime) throw new Error('Este formato no está disponible. Importa un MP3, M4A/AAC, WAV u OGG compatible.');
  if (file.type && !['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'application/ogg'].includes(file.type.toLowerCase())) {
    throw new Error('Este formato no está disponible. Importa un MP3, M4A/AAC, WAV u OGG compatible.');
  }
  await verifyBrowserCanDecodeAudio(file);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const normalizedDataUrl = dataUrl.replace(/^data:[^;,]+;base64,/, `data:${normalizedMime};base64,`);
  if (!('__TAURI_INTERNALS__' in window)) return { storagePath: `browser-audio:${file.name}`, resolvedUrl: normalizedDataUrl, mimeType: normalizedMime };
  const result = await invoke<NativeAudioResult>('import_audio_data_url', { dataUrl: normalizedDataUrl, fileName: file.name.replace(/\.[^.]+$/, '') });
  return { storagePath: result.storagePath, resolvedUrl: convertFileSrc(result.absolutePath), mimeType: result.mimeType };
}

async function verifyBrowserCanDecodeAudio(file: File) {
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const audio = document.createElement('audio');
      const timeout = window.setTimeout(() => reject(new Error('La comprobación del audio tardó demasiado.')), 12_000);
      const done = (callback: () => void) => { window.clearTimeout(timeout); audio.removeAttribute('src'); audio.load(); callback(); };
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => done(resolve);
      audio.onerror = () => done(() => reject(new Error('Tu archivo no es compatible con Noite. Importa un MP3, M4A, WAV u OGG compatible.')));
      audio.src = url;
      audio.load();
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
