import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_LOCAL_SETTINGS, profileDisplayName, type ProfileId } from '@proyecto-noche/domain';
import { settingsRepository } from '../lib/repositories';
import { lockAllPasswordVaults } from '../lib/native-password-vault';

interface LocalUser {
  id: string;
  email: string | null;
  displayName: string;
}

interface AuthContextValue {
  user: LocalUser | null;
  loading: boolean;
  actorId: ProfileId;
  switchActor: (id: ProfileId) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => settingsRepository.get() });
  const settings = settingsQuery.data;
  const actorId = settings?.activeProfileId ?? DEFAULT_LOCAL_SETTINGS.profiles.primary.id;

  const value = useMemo<AuthContextValue>(
    () => ({
      user: settings
        ? { id: actorId, email: null, displayName: profileDisplayName(settings, actorId) }
        : null,
      loading: settingsQuery.isLoading,
      actorId,
      switchActor: async (id) => {
        await lockAllPasswordVaults();
        if (settings && id !== settings.activeProfileId) throw new Error('Cambia de persona desde Ajustes para verificar su acceso.');
        await queryClient.invalidateQueries({ queryKey: ['settings'] });
        await queryClient.invalidateQueries({ queryKey: ['review-summary'] });
      },
    }),
    [actorId, queryClient, settings, settingsQuery.isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return context;
}
