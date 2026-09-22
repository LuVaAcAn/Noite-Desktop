import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PasswordVaultEntryInput, VaultProfileSlot } from '@proyecto-noche/domain';
import { passwordVaultRepository } from '../lib/native-password-vault';

const key = (actorId: VaultProfileSlot) => ['password-vault', actorId] as const;

export function usePasswordVaultStatus(actorId: VaultProfileSlot) {
  return useQuery({ queryKey: [...key(actorId), 'status'], queryFn: () => passwordVaultRepository.status(actorId), retry: false });
}

export function usePasswordVaultEntries(actorId: VaultProfileSlot, unlocked: boolean) {
  return useQuery({ queryKey: [...key(actorId), 'entries'], queryFn: () => passwordVaultRepository.list(actorId), enabled: unlocked, retry: false });
}

export function usePasswordVaultActions(actorId: VaultProfileSlot) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(actorId) });
  return {
    initialize: useMutation({ mutationFn: (masterPassword: string) => passwordVaultRepository.initialize(actorId, masterPassword), onSuccess: refresh }),
    unlock: useMutation({ mutationFn: (masterPassword: string) => passwordVaultRepository.unlock(actorId, masterPassword), onSuccess: refresh }),
    lock: useMutation({ mutationFn: () => passwordVaultRepository.lock(actorId), onSuccess: refresh }),
    upsert: useMutation({ mutationFn: (input: PasswordVaultEntryInput) => passwordVaultRepository.upsert(actorId, input), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (entryId: string) => passwordVaultRepository.remove(actorId, entryId), onSuccess: refresh }),
    changeMaster: useMutation({ mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => passwordVaultRepository.changeMaster(actorId, currentPassword, newPassword), onSuccess: refresh }),
    reset: useMutation({ mutationFn: (confirmation: string) => passwordVaultRepository.reset(actorId, confirmation), onSuccess: refresh }),
  };
}
