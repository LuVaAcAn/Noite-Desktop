import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocalSettings, ProfileId } from '@proyecto-noche/domain';
import { settingsRepository } from '../lib/repositories';
import { lockAllPasswordVaults } from '../lib/native-password-vault';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsRepository.get(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<LocalSettings>) => settingsRepository.update(patch),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
        queryClient.invalidateQueries({ queryKey: ['space'] }),
      ]);
    },
  });
}

export function useSwitchActor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: ProfileId) => { await lockAllPasswordVaults(); return settingsRepository.setActiveActor(profileId); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); queryClient.invalidateQueries({ queryKey: ['password-vault'] }); },
  });
}

export function useAddCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (category: { label: string; icon: string; colorHex: string }) =>
      settingsRepository.addCategory(category),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; label: string; icon: string; colorHex: string }) => settingsRepository.updateCategory(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useRemoveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => settingsRepository.removeCategory(categoryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useExportData() {
  return useMutation({ mutationFn: () => settingsRepository.exportBackup() });
}

export function usePreviewImport() {
  return useMutation({ mutationFn: (json: string) => settingsRepository.previewImport(json) });
}

export function useImportData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (json: string) => settingsRepository.importBackup(json),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
