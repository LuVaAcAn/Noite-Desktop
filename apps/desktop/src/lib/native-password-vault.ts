import { invoke } from './invoke';
import type { GeneratePasswordOptions, PasswordVaultEntry, PasswordVaultEntryInput, PasswordVaultRepository, PasswordVaultStatus, VaultProfileSlot } from '@proyecto-noche/domain';

export class PasswordVaultError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = 'PasswordVaultError';
  }
}

function ensureNative() {
  if (!('__TAURI_INTERNALS__' in window)) throw new PasswordVaultError('native_only', 'El gestor cifrado está disponible en la aplicación de escritorio.');
}

async function command<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  ensureNative();
  try {
    return await invoke<T>(name, args);
  } catch (cause) {
    if (typeof cause === 'object' && cause && 'code' in cause && 'message' in cause) {
      const value = cause as { code: string; message: string; details?: unknown };
      throw new PasswordVaultError(value.code, value.message, value.details);
    }
    throw new PasswordVaultError('vault_failed', typeof cause === 'string' ? cause : 'No se pudo acceder al gestor de contraseñas.');
  }
}

export class NativePasswordVaultRepository implements PasswordVaultRepository {
  status(actorId: VaultProfileSlot) { return command<PasswordVaultStatus>('vault_status', { actorId }); }
  initialize(actorId: VaultProfileSlot, masterPassword: string) { return command<PasswordVaultStatus>('vault_initialize', { actorId, masterPassword }); }
  unlock(actorId: VaultProfileSlot, masterPassword: string) { return command<PasswordVaultStatus>('vault_unlock', { actorId, masterPassword }); }
  lock(actorId: VaultProfileSlot) { return command<void>('vault_lock', { actorId }); }
  lockAll() { return command<void>('vault_lock_all'); }
  list(actorId: VaultProfileSlot) { return command<PasswordVaultEntry[]>('vault_list', { actorId }); }
  reveal(actorId: VaultProfileSlot, entryId: string) { return command<string>('vault_reveal', { actorId, entryId }); }
  upsert(actorId: VaultProfileSlot, input: PasswordVaultEntryInput) { return command<PasswordVaultEntry>('vault_upsert', { actorId, input }); }
  remove(actorId: VaultProfileSlot, entryId: string) { return command<void>('vault_delete', { actorId, entryId }); }
  changeMaster(actorId: VaultProfileSlot, currentPassword: string, newPassword: string) { return command<void>('vault_change_master', { actorId, currentPassword, newPassword }); }
  reset(actorId: VaultProfileSlot, confirmation: string) { return command<void>('vault_reset', { actorId, confirmation }); }
  generatePassword(options: GeneratePasswordOptions) { return command<string>('vault_generate_password', { length: options.length, includeDigits: options.includeDigits, includeSymbols: options.includeSymbols }); }
  copySecret(actorId: VaultProfileSlot, entryId: string) { return command<void>('vault_copy_secret', { actorId, entryId }); }
}

export const passwordVaultRepository = new NativePasswordVaultRepository();

export async function lockAllPasswordVaults() {
  if ('__TAURI_INTERNALS__' in window) await passwordVaultRepository.lockAll();
}
