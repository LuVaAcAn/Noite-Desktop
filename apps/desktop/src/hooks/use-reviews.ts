import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SpotifyTrack, UpsertReviewInput } from '@proyecto-noche/domain';
import { reviewRepository } from '../lib/repositories';

export function useReviewSummary(planItemId: string | undefined) {
  return useQuery({
    queryKey: ['review-summary', planItemId],
    queryFn: () => reviewRepository.getForPlanItem(planItemId!),
    enabled: !!planItemId,
  });
}

export function useUpsertReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertReviewInput) => reviewRepository.upsert(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['review-summary', variables.planItemId] });
    },
  });
}

export function useSetTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planItemId, songLink }: { planItemId: string; songLink: string }) =>
      reviewRepository.setTrack(planItemId, songLink),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['review-summary', variables.planItemId] });
    },
  });
}

export function useRemoveTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planItemId: string) => reviewRepository.removeTrack(planItemId),
    onSuccess: (_data, planItemId) => {
      queryClient.invalidateQueries({ queryKey: ['review-summary', planItemId] });
    },
  });
}

export function useSetSpotifyTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planItemId, track }: { planItemId: string; track: SpotifyTrack }) => reviewRepository.setSpotifyTrack(planItemId, track),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['review-summary', variables.planItemId] });
      queryClient.invalidateQueries({ queryKey: ['memory-tracks'] });
    },
  });
}
