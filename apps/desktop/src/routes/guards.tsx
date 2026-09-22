import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSettings } from '../hooks/use-settings';

export function RequireSetup({ children }: { children: ReactNode }) {
  const settings = useSettings();
  if (settings.isLoading) return <div className="flex h-dvh items-center justify-center overflow-hidden text-noche-muted">Cargando…</div>;
  if (settings.isError) return <div className="flex h-dvh flex-col items-center justify-center gap-3 overflow-hidden px-6 text-center"><p className="text-red-600">No se pudieron abrir tus datos.</p><button className="rounded-full bg-noche-text px-4 py-2 text-noche-bg" onClick={() => settings.refetch()}>Reintentar</button></div>;
  if (!settings.data?.onboardingComplete || settings.data.onboardingStage !== 'complete' || settings.data.setupVersion === 0) return <Navigate to="/bienvenida" replace />;
  return <>{children}</>;
}
