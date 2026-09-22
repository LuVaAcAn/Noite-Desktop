import type {
  GameImportInput,
  GameImportResult,
  GameInstallationSummary,
  GameScanReport,
  GameScanState,
  ProviderScanResult,
} from '@proyecto-noche/domain';
import { listen } from '@tauri-apps/api/event';
import { invoke } from './invoke';
import { invalidateNativePersistenceCache } from './native-persistence';
import { localStore } from '@proyecto-noche/domain';

export function gameScanStatus() {
  return invoke<GameScanState>('game_scan_status');
}

export function gameScanReport() {
  return invoke<GameScanReport>('game_scan_report');
}

export function scanInstalledGames() {
  return invoke<GameScanReport>('scan_installed_games');
}

export function onGameScanProgress(callback: (progress: ProviderScanResult) => void) {
  return listen<ProviderScanResult>('game-scan-progress', (event) => callback(event.payload));
}

export function skipGameScan() {
  return invoke<void>('skip_game_scan');
}

export async function commitGameImport(input: GameImportInput) {
  const result = await invoke<GameImportResult>('commit_game_import', {
    newItems: input.newItems,
    bindings: input.bindings,
    ignoredInstallationIds: input.ignoredInstallationIds,
  });
  invalidateNativePersistenceCache();
  // Native imports bypass the domain store. Refresh it before queries reread
  // the library, otherwise a later edit could overwrite freshly imported games.
  await localStore.reload();
  return result;
}

export function gameInstallationsForItems(itemIds: string[]) {
  return invoke<GameInstallationSummary[]>('game_installations_for_items', { itemIds });
}

export function launchGameInstallation(installationId: string) {
  return invoke<void>('launch_game_installation', { installationId });
}

export function setPreferredGameInstallation(installationId: string) {
  return invoke<void>('set_preferred_game_installation', { installationId });
}

export function addManualGameInstallation(libraryItemId: string, itemTitle: string) {
  return invoke<GameInstallationSummary | null>('add_manual_game_installation', { libraryItemId, itemTitle });
}
