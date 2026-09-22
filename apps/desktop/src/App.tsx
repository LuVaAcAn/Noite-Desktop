import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './hooks/use-auth';
import { SpaceProvider } from './hooks/use-space';
import { RequireSetup } from './routes/guards';
import { WelcomeSetupPage } from './features/space/WelcomeSetupPage';
import { HomePage } from './features/space/HomePage';
import { SettingsPage } from './features/settings/SettingsPage';
import { LibraryPreviewPage } from './features/library/LibraryPreviewPage';
import { LibraryAllPage } from './features/library/LibraryAllPage';
import { SearchResultsPage } from './features/library/SearchResultsPage';
import { AddActivityForm } from './features/library/AddActivityForm';
import { ItemDetailPage } from './features/memories/ItemDetailPage';
import { ItemGalleryPage } from './features/memories/ItemGalleryPage';
import { CalendarPage } from './features/plans/CalendarPage';
import { SessionPage } from './features/sessions/SessionPage';
import { ToastViewport } from './components/ui/ToastViewport';
import { CommandPalette } from './components/ui/CommandPalette';
import { GamepadProvider } from './hooks/use-gamepads';
import { MotionPreference } from './components/ui/MotionPreference';
import { AnimatedRoute } from './components/ui/AnimatedRoute';
import { MusicPage } from './features/music/MusicPage';
import { AppEntryExperience } from './components/ui/AppEntryExperience';
import { SoundPreference } from './components/ui/SoundPreference';
import { GlobalGalleryPage } from './features/memories/GlobalGalleryPage';
import { PersistentAppShell } from './components/ui/AppShell';
import { VaultSessionGuard } from './components/ui/VaultSessionGuard';
import { LocaleBoundary } from './components/ui/LocaleBoundary';
import { queryClient } from './lib/query-client';
import { GameDiscoveryPage } from './features/library/GameDiscoveryPage';

function Ready({ children }: { children: React.ReactNode }) {
  return <RequireSetup>{children}</RequireSetup>;
}

function AppRoutes() {
  const location = useLocation();
  return <AnimatedRoute key={`${location.pathname}${location.search}`}><Routes location={location}>
    <Route path="/bienvenida" element={<WelcomeSetupPage />} />
    <Route path="/cuenta" element={<Navigate to="/settings?section=profile" replace />} />
    <Route path="/" element={<Ready><HomePage /></Ready>} />
    <Route path="/biblioteca/:section" element={<Ready><LibraryPreviewPage /></Ready>} />
    <Route path="/biblioteca/:section/todos" element={<Ready><LibraryAllPage /></Ready>} />
    <Route path="/juegos/instalados" element={<Ready><GameDiscoveryPage /></Ready>} />
    <Route path="/biblioteca/item/:itemId" element={<Ready><ItemDetailPage /></Ready>} />
    <Route path="/biblioteca/item/:itemId/galeria" element={<Ready><ItemGalleryPage /></Ready>} />
    <Route path="/buscar" element={<Ready><SearchResultsPage /></Ready>} />
    <Route path="/actividades/nueva" element={<Ready><AddActivityForm /></Ready>} />
    <Route path="/calendario" element={<Ready><CalendarPage /></Ready>} />
    <Route path="/musica" element={<Ready><MusicPage /></Ready>} />
    <Route path="/galeria" element={<Ready><GlobalGalleryPage /></Ready>} />
    <Route path="/sesion" element={<Ready><SessionPage /></Ready>} />
    <Route path="/settings" element={<Ready><SettingsPage /></Ready>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AnimatedRoute>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SpaceProvider>
            <LocaleBoundary>
              <BrowserRouter>
                <GamepadProvider>
                  <MotionPreference />
                  <SoundPreference />
                  <VaultSessionGuard />
                  <AppEntryExperience>
                    <ToastViewport />
                    <CommandPalette />
                    <PersistentAppShell><AppRoutes /></PersistentAppShell>
                  </AppEntryExperience>
                </GamepadProvider>
              </BrowserRouter>
            </LocaleBoundary>
          </SpaceProvider>
        </AuthProvider>
    </QueryClientProvider>
  );
}
