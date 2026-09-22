import type { LibraryItem } from './library-item';

export type GameStore = 'steam' | 'epic' | 'gog' | 'xbox' | 'ea' | 'ubisoft' | 'battlenet' | 'manual';
export type GameScanStatus = 'not_asked' | 'pending_review' | 'completed' | 'skipped';

export interface GameScanState {
  status: GameScanStatus;
  scannerVersion: number;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
}

export interface GameScanCandidate {
  installationId: string;
  discoveryKey: string;
  store: GameStore;
  storeGameId: string;
  title: string;
  installLocation: string | null;
  launchable: boolean;
  available: boolean;
  ignored: boolean;
  linkedLibraryItemId: string | null;
}

export interface ProviderScanResult {
  store: GameStore;
  status: 'ok' | 'unavailable' | 'partial' | 'error';
  found: number;
  warnings: string[];
}

export interface GameScanReport {
  candidates: GameScanCandidate[];
  providers: ProviderScanResult[];
}

export interface GameInstallationSummary {
  installationId: string;
  libraryItemId: string;
  store: GameStore;
  title: string;
  available: boolean;
  launchable: boolean;
  preferred: boolean;
}

export interface GameBindingInput {
  installationId: string;
  libraryItemId: string;
  preferred?: boolean;
}

export interface GameImportInput {
  newItems: LibraryItem[];
  bindings: GameBindingInput[];
  ignoredInstallationIds: string[];
}

export interface GameImportResult {
  createdItemIds: string[];
  linkedCount: number;
}
