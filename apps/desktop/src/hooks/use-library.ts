import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateLibraryItemInput, LibraryFilters, UpdateLibraryItemInput } from '@proyecto-noche/domain';
import { libraryRepository, planRepository } from '../lib/repositories';
import { useSpace } from './use-space';

export function useLibraryList(filters: LibraryFilters) {
  const { space } = useSpace();
  return useQuery({
    queryKey: ['library', space?.id, filters],
    queryFn: () => libraryRepository.list(space!.id, filters),
    enabled: !!space,
    placeholderData: (previous) => previous,
  });
}

export function useLibraryItem(id: string | undefined) {
  return useQuery({
    queryKey: ['library-item', id],
    queryFn: () => libraryRepository.get(id!),
    enabled: !!id,
  });
}

export function useCreateLibraryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLibraryItemInput) => libraryRepository.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

export function useUpdateLibraryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLibraryItemInput }) =>
      libraryRepository.update(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['library-item', variables.id] });
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      libraryRepository.toggleFavorite(id, isFavorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

export function useArchiveLibraryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => libraryRepository.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

export function useRestoreLibraryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => libraryRepository.restore(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  });
}

export function useCompleteLibraryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (libraryItemId: string) => planRepository.recordCompletedActivity(libraryItemId),
    onSuccess: async (_result, libraryItemId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['library'] }),
        queryClient.invalidateQueries({ queryKey: ['library-item', libraryItemId] }),
        queryClient.invalidateQueries({ queryKey: ['plans'] }),
      ]);
      window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Actividad completada. Ya pueden registrar el recuerdo.' }));
      window.dispatchEvent(new CustomEvent('app-sound', { detail: 'success' }));
    },
  });
}
