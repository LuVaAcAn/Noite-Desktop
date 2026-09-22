import type { GeneratePasswordOptions, PasswordVaultEntry, PasswordVaultEntryInput, PasswordVaultStatus, VaultProfileSlot } from '../entities/password-vault';

export interface PasswordVaultRepository {
  status(actorId: VaultProfileSlot): Promise<PasswordVaultStatus>;
  initialize(actorId: VaultProfileSlot, masterPassword: string): Promise<PasswordVaultStatus>;
  unlock(actorId: VaultProfileSlot, masterPassword: string): Promise<PasswordVaultStatus>;
  lock(actorId: VaultProfileSlot): Promise<void>;
  lockAll(): Promise<void>;
  list(actorId: VaultProfileSlot): Promise<PasswordVaultEntry[]>;
  reveal(actorId: VaultProfileSlot, entryId: string): Promise<string>;
  upsert(actorId: VaultProfileSlot, input: PasswordVaultEntryInput): Promise<PasswordVaultEntry>;
  remove(actorId: VaultProfileSlot, entryId: string): Promise<void>;
  changeMaster(actorId: VaultProfileSlot, currentPassword: string, newPassword: string): Promise<void>;
  reset(actorId: VaultProfileSlot, confirmation: string): Promise<void>;
  generatePassword(options: GeneratePasswordOptions): Promise<string>;
  copySecret(actorId: VaultProfileSlot, entryId: string): Promise<void>;
}
