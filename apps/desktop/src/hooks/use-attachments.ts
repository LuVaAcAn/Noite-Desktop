import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UploadAttachmentInput } from '@proyecto-noche/domain';
import { attachmentRepository } from '../lib/repositories';

export function useAttachments(planItemId: string | undefined) {
  return useQuery({
    queryKey: ['attachments', planItemId],
    queryFn: () => attachmentRepository.listForPlanItem(planItemId!),
    enabled: !!planItemId,
  });
}

export function useAllAttachments(spaceId: string | undefined, includeArchived = false) {
  return useQuery({
    queryKey: ['attachments', 'all', spaceId, includeArchived],
    queryFn: () => attachmentRepository.listAll(spaceId!, includeArchived),
    enabled: !!spaceId,
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadAttachmentInput) => attachmentRepository.upload(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['attachments', variables.planItemId] });
      queryClient.invalidateQueries({ queryKey: ['attachments', 'all'] });
    },
  });
}

export function useArchiveAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => attachmentRepository.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments'] }),
  });
}

export function useRestoreAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => attachmentRepository.restore(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments'] }),
  });
}

export function useRemoveAttachment(planItemId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => attachmentRepository.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', planItemId] });
    },
  });
}
