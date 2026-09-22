import { invoke } from './invoke';

export interface SystemStatus {
  batteryPercent: number | null;
  charging: boolean | null;
  audioOutputName: string | null;
  audioOutputKind: 'speaker' | 'headphones' | 'bluetooth' | 'unknown' | null;
}

export async function getSystemStatus(): Promise<SystemStatus> {
  if (!('__TAURI_INTERNALS__' in window)) return { batteryPercent: null, charging: null, audioOutputName: null, audioOutputKind: null };
  return invoke<SystemStatus>('get_system_status');
}

export async function exitApp() {
  if ('__TAURI_INTERNALS__' in window) return invoke('exit_app');
  window.close();
}

export async function openExternal(url: string) {
  if ('__TAURI_INTERNALS__' in window) return invoke('open_external', { url });
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'spotify:') throw new Error('Noite bloqueó un enlace no seguro.');
  window.open(url, '_blank', 'noopener,noreferrer');
}
