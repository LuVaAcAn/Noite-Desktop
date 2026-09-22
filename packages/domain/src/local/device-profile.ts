import type { LocalSettings } from '../entities/local-settings';

const KEY = 'noite.device-profile';
/** Device preference, deliberately outside portable backups and shared state. */
export function deviceProfileId(settings: Pick<LocalSettings, 'profiles'>): string {
  let selected: string | null = null;
  try { selected = globalThis.localStorage?.getItem(KEY) ?? null; } catch { /* unavailable storage */ }
  return selected === settings.profiles.partner.id ? selected : settings.profiles.primary.id;
}

export function rememberDeviceProfile(id: string): void {
  if (typeof globalThis.localStorage !== 'undefined') globalThis.localStorage.setItem(KEY, id);
}
