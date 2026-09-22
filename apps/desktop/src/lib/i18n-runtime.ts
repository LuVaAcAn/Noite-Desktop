import type { Locale } from '@proyecto-noche/domain';
import catalog from './i18n-catalog.json';

const translations = catalog as Record<string, string>;
const translationEntries = Object.entries(translations).sort(([left], [right]) => right.length - left.length);
function readStoredLocale() {
  try { return typeof window !== 'undefined' ? window.localStorage.getItem('noite-locale') : null; }
  catch { return null; }
}

const storedLocale = readStoredLocale();
let runtimeLocale: Locale = storedLocale === 'en' ? 'en' : 'es';

export function setRuntimeLocale(locale: Locale) {
  runtimeLocale = locale;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  try { if (typeof window !== 'undefined') window.localStorage.setItem('noite-locale', locale); }
  catch { /* The active profile remains authoritative when Web Storage is unavailable. */ }
}

export function getRuntimeLocale() { return runtimeLocale; }

export function translateLiteral(value: string): string {
  if (runtimeLocale !== 'en' || !value) return value;
  const whitespace = value.match(/^(\s*)(.*?)(\s*)$/su);
  const leading = whitespace?.[1] ?? '';
  const content = whitespace?.[2] ?? value;
  const trailing = whitespace?.[3] ?? '';
  const exact = translations[content];
  if (exact) return `${leading}${exact}${trailing}`;
  const recentSection = content.match(/^(.+) recientes$/u);
  if (recentSection) {
    const countedActivities = recentSection[1].match(/^(\d+) actividades$/u);
    const recent = countedActivities
      ? `${countedActivities[1]} recent activities`
      : `Recent ${translateLiteral(recentSection[1])}`;
    return `${leading}${recent}${trailing}`;
  }
  let translated = content;
  for (const [source, target] of translationEntries) {
    if (source.length >= 4 && translated.includes(source)) translated = translated.replaceAll(source, target);
  }
  return `${leading}${translated}${trailing}`;
}

const nativeErrors: Record<string, string> = {
  local_data_failed: 'Noite could not read or save local data.',
  persistence_failed: 'Noite could not read or save local data.',
  invalid_audio_data: 'The selected audio data is invalid.',
  invalid_audio_source: 'Only local audio files are supported.',
  unreadable_audio: 'Noite could not read the audio file.',
  audio_too_large: 'The audio file exceeds the 100 MB limit.',
  unsupported_audio: 'Your file is not compatible with Noite. Import a compatible MP3, M4A, WAV or OGG file.',
  invalid_response: 'The service returned an invalid response. Try again.',
  network: 'The service could not be reached. Check your Internet connection.',
  invalid_tmdb: 'The TMDB credential is invalid.',
  invalid_igdb: 'The IGDB credentials are invalid.',
  missing_tmdb: 'Set up the TMDB API key first.',
  missing_igdb: 'Set up the IGDB credentials first.',
  tmdb_unavailable: 'TMDB is temporarily unavailable.',
  igdb_unavailable: 'IGDB is temporarily unavailable.',
  confirmation_required: 'Enter the requested confirmation text to continue.',
  not_archived: 'This item is not archived.',
  not_found: 'The requested item could not be found.',
  backup_too_large: 'The backup is too large to process.',
  invalid_database: 'The backup database is invalid.',
  invalid_manifest: 'The backup manifest is invalid.',
  invalid_host: 'This address is not allowed.',
  invalid_image: 'The selected image is invalid.',
  invalid_media: 'The selected media file is invalid.',
  invalid_media_category: 'The selected media category is invalid.',
  invalid_url: 'The address is invalid.',
  media_missing: 'Noite cannot find this media file.',
  media_too_large: 'The media file exceeds the allowed size.',
  missing_database: 'The backup does not contain its database.',
  missing_manifest: 'The backup does not contain its manifest.',
  open_failed: 'Noite could not open the requested location.',
  too_large: 'The selected file is too large.',
  unsupported_media: 'This media format is not supported.',
  invalid_locale: 'The selected language is not valid.',
  invalid_profile_credential: 'The credential is incorrect.',
  invalid_recovery_code: 'The recovery code is incorrect.',
  profile_locked: 'This profile is temporarily locked. Try again later.',
  profile_auth_not_configured: 'This profile does not have a credential yet.',
  weak_backup_password: 'The backup password must contain at least 12 characters.',
  wrong_backup_password: 'The password is incorrect or the backup was modified.',
  invalid_backup: 'The backup is incomplete or invalid.',
  invalid_backup_extension: 'Noite only accepts .noche files. Do not use ZIP or JSON files.',
  unsupported_backup: 'This backup version is not supported.',
  backup_encryption_failed: 'The backup could not be encrypted.',
  invalid_pairing_payload: 'The invitation contains damaged or invalid shared data.',
  invalid_peer: 'The linked computer identity is invalid.',
  invalid_request: 'The other computer sent an invalid request.',
  peer_limit: 'This space already has its two computers linked.',
  conflict_missing: 'This sync conflict no longer exists.',
  sync_error: 'Synchronization could not be completed.',
  sync_failed: 'Synchronization could not be completed.',
  peer_unavailable: 'The other computer did not respond. Make sure Noite is open and try again.',
  relay_unavailable: 'Noite could not access the relay. Check the Internet connection on both computers.',
  transfer_interrupted: 'The connection was interrupted. Keep Noite open on both computers and try again.',
  connection_failed: 'Noite could not connect both computers. Check the invitation and try again.',
  sync_in_progress: 'A synchronization is already in progress.',
  sync_retry_too_soon: 'Wait five seconds before trying to synchronize again.',
  not_paired: 'There is no linked computer.',
  media_corrupt: 'The received file failed its integrity check.',
  media_changed: 'The file changed during transfer. Try again.',
  pairing_attempt_limit: 'This invitation reached the limit of five attempts on this computer.',
  timeout: 'The service took too long to respond.',
  offline: 'The service could not be reached. Check your Internet connection.',
  rate_limited: 'Too many requests were made. Wait before trying again.',
  invalid_link: 'The link is not valid or supported.',
  invalid_provider: 'The selected provider is not valid.',
  invalid_query: 'Enter a valid search term.',
  unsupported_kind: 'This activity type does not support automatic cover search.',
  credential_store: 'The credential could not be saved in Windows secure storage.',
  vault_locked: 'The private vault is locked.',
  vault_corrupt: 'The private vault could not be verified.',
  vault_failed: 'The private vault operation could not be completed.',
  invalid_master_password: 'The master password is incorrect.',
  weak_master_password: 'The master password must contain at least 12 characters.',
  already_configured: 'This profile already has a private vault.',
  entry_not_found: 'This password entry no longer exists.',
  invalid_actor: 'The selected profile is invalid.',
  invalid_entry: 'Complete the required fields before saving.',
  invalid_length: 'Choose a valid password length.',
  not_configured: 'This profile does not have a private vault yet.',
  unlock_throttled: 'Wait a moment before trying to unlock the vault again.',
  auth_runtime: 'The profile session could not be updated.',
  cannot_reset_self: 'You cannot remove your own profile credential.',
  invalid_credential_kind: 'Choose a PIN or password.',
  invalid_pin: 'The PIN must contain exactly four digits.',
  invalid_profile_pair: 'You can only reset the other profile in this couple.',
  profile_auth_corrupt: 'This profile credential could not be verified.',
  profile_not_open: 'This profile requires setup or a credential.',
  profiles_unavailable: 'The couple profiles could not be verified.',
  requester_locked: 'Unlock your profile before resetting your partner\'s credential.',
  weak_profile_password: 'The profile password must contain at least eight characters.',
  preview_unavailable: 'Spotify could not load this preview. Try again.'
};

export function localizeNativeError(cause: unknown): Error {
  const raw = cause as { code?: unknown; message?: unknown; details?: unknown } | null;
  const code = raw && typeof raw === 'object' && typeof raw.code === 'string' ? raw.code : undefined;
  const message = raw && typeof raw === 'object' && typeof raw.message === 'string'
    ? raw.message
    : cause instanceof Error ? cause.message : String(cause);
  const localized = runtimeLocale === 'en' ? (code ? nativeErrors[code] : undefined) ?? translateLiteral(message) : message;
  const error = new Error(localized);
  if (code) Object.assign(error, { code, details: raw?.details });
  return error;
}
