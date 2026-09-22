import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Space, SpaceMember } from '@proyecto-noche/domain';
import { spaceRepository } from '../lib/repositories';
import { useAuth } from './use-auth';

interface SpaceContextValue {
  space: Space | null;
  members: SpaceMember[];
  isLoading: boolean;
  partner: SpaceMember | null;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

export function SpaceProvider({ children }: { children: ReactNode }) {
  const { user, actorId } = useAuth();

  const spaceQuery = useQuery({
    queryKey: ['space', 'mine'],
    queryFn: () => spaceRepository.getMine(),
    enabled: !!user,
  });

  const membersQuery = useQuery({
    queryKey: ['space', spaceQuery.data?.id, 'members'],
    queryFn: () => spaceRepository.members(spaceQuery.data!.id),
    enabled: !!spaceQuery.data,
  });

  const members = membersQuery.data ?? [];
  const partner = members.find((m) => m.userId !== actorId) ?? null;

  return (
    <SpaceContext.Provider
      value={{
        space: spaceQuery.data ?? null,
        members,
        partner,
        isLoading: spaceQuery.isLoading || membersQuery.isLoading,
      }}
    >
      {children}
    </SpaceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSpace() {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error('useSpace debe usarse dentro de <SpaceProvider>');
  return ctx;
}
