import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { TopBar } from './TopBar';
import { StatusBar } from './StatusBar';
import { ControllerHud } from './ControllerHud';
import { GalleryFab } from './GalleryFab';
import { useSettings } from '../../hooks/use-settings';
import { accentFromCategoryColor, defaultAppearance, hexRgb, sectionKeyFromPath } from '../../lib/section-theme';
import { GlobalMusicPlayer } from './GlobalMusicPlayer';
import { OverlayHost, OverlayProvider } from './Overlay';
import { GameDiscoveryManager } from './GameDiscoveryManager';

interface AppShellProps {
  children: ReactNode;
  navigation?: boolean;
  activeSection?: string;
  showBack?: boolean;
  className?: string;
}

export function AppShell({ children, navigation = false, activeSection, showBack, className }: AppShellProps) {
  void navigation;
  void activeSection;
  void showBack;
  void className;
  return <>{children}</>;
}

function useLoadedBackground(path: string | null) {
  const [loaded, setLoaded] = useState<{ source: string; url: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setLoaded(null);
      return;
    }
    setLoaded(null);
    const image = new Image();
    image.onload = () => { if (!cancelled) setLoaded({ source: path, url: path }); };
    image.onerror = () => { if (!cancelled) setLoaded(null); };
    image.src = path;
    return () => { cancelled = true; };
  }, [path]);
  return loaded?.source === path ? loaded.url : null;
}

export function PersistentAppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data: settings } = useSettings();
  const key = sectionKeyFromPath(location.pathname);
  const customCategory = settings?.customCategories.find((category) => category.id === key);
  const configuredAppearance = settings?.sectionAppearances[key];
  const configuredOrDefaultAppearance = configuredAppearance?.preset === 'custom'
    ? configuredAppearance
    : defaultAppearance(key, accentFromCategoryColor(customCategory?.colorHex), settings?.colorMode ?? 'light');
  const appearance = configuredOrDefaultAppearance;
  const flat = settings?.colorMode === 'dark-flat';
  const loadedBackground = useLoadedBackground(appearance.backgroundImagePath);
  if (location.pathname === '/bienvenida' || location.pathname === '/cuenta') return <>{children}</>;
  const navigation = location.pathname === '/'
    || /^\/biblioteca\/(?!item\/)[^/]+(?:\/todos)?$/.test(location.pathname)
    || location.pathname === '/calendario'
    || location.pathname === '/musica';
  const showBack = !navigation;
  const colors = appearance.dark
    ? { bg: '9 10 14', surface: '24 25 31', hover: '35 37 45', border: '61 63 76', text: '248 250 252', muted: '174 180 194' }
    : { bg: '247 251 255', surface: '255 255 255', hover: '238 247 253', border: '207 231 245', text: '17 24 39', muted: '91 107 124' };
  const style = {
    colorScheme: appearance.dark ? 'dark' : 'light',
    '--noche-bg': colors.bg,
    '--noche-surface': colors.surface,
    '--noche-surface-hover': colors.hover,
    '--noche-border': colors.border,
    '--noche-text': colors.text,
    '--noche-muted': colors.muted,
    '--theme-accent': hexRgb(appearance.accent),
  } as CSSProperties;
  return (
    <OverlayProvider><div data-noite-shell data-theme-section={key} data-theme-dark={appearance.dark || undefined} data-theme-flat={flat || undefined} style={style} className="relative isolate grid h-dvh min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden bg-noche-bg text-noche-text">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" style={{ background: flat ? appearance.gradientFrom : `linear-gradient(145deg, ${appearance.gradientFrom}, ${appearance.gradientTo})` }}>
        {loadedBackground && <img src={loadedBackground} alt="" className="h-full w-full object-cover" style={{ filter: `blur(${appearance.blurPx}px) contrast(${appearance.contrastPercent}%) saturate(${appearance.saturationPercent}%)`, transform: appearance.blurPx ? 'scale(1.04)' : undefined }} />}
        {loadedBackground && appearance.dimPercent > 0 && <span className="absolute inset-0 bg-black" style={{ opacity: appearance.dimPercent / 100 }} />}
      </div>
      <StatusBar />
      {navigation ? <AppHeader activeSection={key} /> : <TopBar showBack={showBack} />}
      {children}
      <GlobalMusicPlayer />
      <GalleryFab />
      <ControllerHud />
      <OverlayHost />
      <GameDiscoveryManager />
    </div></OverlayProvider>
  );
}
