import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateSavedMusicInput } from '@proyecto-noche/domain';
import { musicLibraryRepository, reviewRepository, spotifyLinkService } from '../lib/repositories';
import { useQueryClient } from '@tanstack/react-query';

export function useSpotifyLinkPreview() {
  return useMutation({ mutationFn: (input: string) => spotifyLinkService.preview(input) });
}

export function useRecentTracks(spaceId?: string) {
  return useQuery({ queryKey: ['memory-tracks', spaceId], queryFn: () => reviewRepository.listTracks(spaceId!), enabled: !!spaceId });
}

export function useSavedMusic(spaceId?: string) {
  return useQuery({ queryKey: ['saved-music', spaceId], queryFn: () => musicLibraryRepository.list(spaceId!), enabled: !!spaceId });
}

export function useSaveMusic() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateSavedMusicInput) => musicLibraryRepository.save(input), onSuccess: (item) => queryClient.invalidateQueries({ queryKey: ['saved-music', item.spaceId] }) });
}

export function useRemoveSavedMusic(spaceId?: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (id: string) => musicLibraryRepository.remove(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-music', spaceId] }) });
}

export function useRenameSavedMusic(spaceId?: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => musicLibraryRepository.rename(id, title), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-music', spaceId] }) });
}

export function useAttachSavedMusic(planItemId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (savedMusicItemId: string) => musicLibraryRepository.attach(planItemId!, savedMusicItemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['review-summary', planItemId] }),
  });
}
