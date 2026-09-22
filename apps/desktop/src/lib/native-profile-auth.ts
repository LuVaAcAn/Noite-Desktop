import { invoke } from './invoke';
import type { Locale, ProfileAuthStatus, ProfileCredentialKind } from '@proyecto-noche/domain';

const browserSessions = new Set<string>();
const browserAccessModes = new Map<string, ProfileAuthStatus['accessMode']>();

export async function profileAuthStatus(profileId: string): Promise<ProfileAuthStatus> {
  if (!('__TAURI_INTERNALS__' in window)) {
    const accessMode = browserAccessModes.get(profileId) ?? 'setup_required';
    return { profileId, initialized: accessMode !== 'setup_required', unlocked: browserSessions.has(profileId), accessMode, credentialKind: accessMode === 'protected' ? 'pin' : null, locale: 'es', lockedUntil: null };
  }
  return invoke('profile_auth_status', { profileId });
}

export async function setupProfileAuth(profileId: string, credentialKind: ProfileCredentialKind, credential: string, locale: Locale) {
  if (!('__TAURI_INTERNALS__' in window)) { browserAccessModes.set(profileId, 'protected'); browserSessions.add(profileId); return { status: await profileAuthStatus(profileId), recoveryCode: crypto.randomUUID().replaceAll('-', '') }; }
  return invoke<{ status: ProfileAuthStatus; recoveryCode: string }>('profile_auth_setup', { profileId, credentialKind, credential, locale });
}

export async function setupOpenProfile(profileId: string, locale: Locale) {
  if (!('__TAURI_INTERNALS__' in window)) { browserAccessModes.set(profileId, 'open'); browserSessions.add(profileId); return profileAuthStatus(profileId); }
  return invoke<ProfileAuthStatus>('profile_auth_setup_open', { profileId, locale });
}

export async function enterOpenProfile(profileId: string) {
  if (!('__TAURI_INTERNALS__' in window)) { if (browserAccessModes.get(profileId) !== 'open') throw new Error('Este perfil requiere configuración.'); browserSessions.add(profileId); return profileAuthStatus(profileId); }
  return invoke<ProfileAuthStatus>('profile_auth_enter_open', { profileId });
}

export async function resetOtherProfileCredential(requesterProfileId: string, targetProfileId: string) {
  if (!('__TAURI_INTERNALS__' in window)) {
    if (requesterProfileId === targetProfileId) throw new Error('No puedes restablecer tu propio perfil.');
    if (!browserSessions.has(requesterProfileId)) throw new Error('Desbloquea tu perfil primero.');
    browserAccessModes.set(targetProfileId, 'setup_required'); browserSessions.delete(targetProfileId);
    return profileAuthStatus(targetProfileId);
  }
  return invoke<ProfileAuthStatus>('profile_auth_reset_other', { requesterProfileId, targetProfileId });
}

export async function unlockProfile(profileId: string, credential: string) {
  if (!('__TAURI_INTERNALS__' in window)) { browserSessions.add(profileId); return profileAuthStatus(profileId); }
  return invoke<ProfileAuthStatus>('profile_auth_unlock', { profileId, credential });
}

export async function recoverProfile(profileId: string, recoveryCode: string) {
  if (!('__TAURI_INTERNALS__' in window)) return profileAuthStatus(profileId);
  return invoke<ProfileAuthStatus>('profile_auth_recover', { profileId, recoveryCode });
}

export async function lockAllProfiles() {
  browserSessions.clear();
  if ('__TAURI_INTERNALS__' in window) await invoke('profile_auth_lock_all');
}
