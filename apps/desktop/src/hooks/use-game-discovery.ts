import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameImportInput } from '@proyecto-noche/domain';
import {
  addManualGameInstallation,
  commitGameImport,
  gameInstallationsForItems,
  gameScanReport,
  gameScanStatus,
  launchGameInstallation,
  scanInstalledGames,
  setPreferredGameInstallation,
  skipGameScan,
} from '../lib/native-game-discovery';

export function useGameScanStatus() {
  return useQuery({ queryKey: ['game-scan-status'], queryFn: gameScanStatus, enabled: '__TAURI_INTERNALS__' in window, staleTime: 30_000 });
}

export function useGameScanReport() {
  return useQuery({
    queryKey: ['game-scan-report'],
    queryFn: gameScanReport,
    enabled: '__TAURI_INTERNALS__' in window,
    staleTime: 30_000,
  });
}

export function useScanInstalledGames() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: scanInstalledGames,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['game-scan-status'] }),
        queryClient.invalidateQueries({ queryKey: ['game-scan-report'] }),
      ]);
    },
  });
}

export function useSkipGameScan() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: skipGameScan, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['game-scan-status'] }) });
}

export function useCommitGameImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GameImportInput) => commitGameImport(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['game-scan-status'] }),
        queryClient.invalidateQueries({ queryKey: ['game-scan-report'] }),
        queryClient.invalidateQueries({ queryKey: ['game-installations'] }),
        queryClient.invalidateQueries({ queryKey: ['library'] }),
      ]);
      window.dispatchEvent(new CustomEvent('local-state-committed'));
    },
  });
}

export function useGameInstallations(itemIds: string[]) {
  return useQuery({
    queryKey: ['game-installations', [...itemIds].sort()],
    queryFn: () => gameInstallationsForItems(itemIds),
    enabled: itemIds.length > 0 && '__TAURI_INTERNALS__' in window,
  });
}

export function useLaunchGame() {
  return useMutation({
    mutationFn: launchGameInstallation,
    onSuccess: () => window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Abriendo juego…' })),
  });
}

export function useSetPreferredGameInstallation() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: setPreferredGameInstallation, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['game-installations'] }) });
}

export function useAddManualGameInstallation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ libraryItemId, itemTitle }: { libraryItemId: string; itemTitle: string }) => addManualGameInstallation(libraryItemId, itemTitle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['game-installations'] }),
  });
}
