import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RegisterActivityInput } from '@proyecto-noche/domain';
import { activityRepository } from '../lib/repositories';
import { useSpace } from './use-space';

export type RegisterActivityFormInput = Omit<RegisterActivityInput, 'spaceId'>;

export function useRegisterActivity() {
  const { space } = useSpace();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterActivityFormInput) => {
      if (!space) throw new Error('No hay un espacio activo');
      return activityRepository.register({ ...input, spaceId: space.id });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['library'] }),
        queryClient.invalidateQueries({ queryKey: ['plans'] }),
      ]);
    },
  });
}
