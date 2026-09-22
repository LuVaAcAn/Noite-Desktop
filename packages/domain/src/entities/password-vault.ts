export type VaultProfileSlot = 'me' | 'partner';

export interface PasswordVaultStatus {
  actorId: VaultProfileSlot;
  configured: boolean;
  unlocked: boolean;
  entryCount: number;
}

export interface PasswordVaultEntry {
  id: string;
  actorId: VaultProfileSlot;
  site: string;
  url: string;
  username: string;
  notes: string;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordVaultEntryInput {
  id?: string | null;
  site: string;
  url: string;
  username: string;
  password: string;
  notes: string;
}

export interface GeneratePasswordOptions {
  length: number;
  includeDigits: boolean;
  includeSymbols: boolean;
}
