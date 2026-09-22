import { create } from 'zustand';
import type { AppEntryState, SavedMusicItem } from '@proyecto-noche/domain';

export type NavSection = 'inicio' | 'juegos' | 'peliculas' | 'series' | 'favoritos' | 'calendario';

interface UiState {
  activeSection: NavSection;
  setActiveSection: (section: NavSection) => void;
  entryState: AppEntryState;
  setEntryState: (entryState: AppEntryState) => void;
  autoResumeEnabled: boolean;
  disableAutoResume: () => void;
  musicSelectedId: string | null;
  musicPreviewItem: SavedMusicItem | null;
  musicMinimized: boolean;
  musicPlayRequest: number;
  musicPlaybackState: 'idle' | 'blocked' | 'unsupported' | 'missing' | 'playing';
  selectMusicItem: (item: SavedMusicItem, preview?: boolean) => void;
  setMusicSelectedId: (id: string | null) => void;
  setMusicMinimized: (minimized: boolean) => void;
  setMusicPlaybackState: (state: UiState['musicPlaybackState']) => void;
  returnToTitle: () => void;
  resetAll: () => void;
}

// Estado puramente de interfaz (qué pestaña está activa, preferencias de
// sonido locales). Los datos remotos viven en TanStack Query, no aquí —
// ver hooks/use-library.ts.
export const useUiStore = create<UiState>((set) => ({
  activeSection: 'inicio',
  setActiveSection: (section) => set({ activeSection: section }),
  entryState: 'boot',
  setEntryState: (entryState) => set({ entryState }),
  autoResumeEnabled: true,
  disableAutoResume: () => set({ autoResumeEnabled: false }),
  musicSelectedId: null,
  musicPreviewItem: null,
  musicMinimized: false,
  musicPlayRequest: 0,
  musicPlaybackState: 'idle',
  selectMusicItem: (item, preview = false) => set((state) => ({
    musicSelectedId: item.id,
    musicPreviewItem: preview ? item : null,
    musicMinimized: false,
    musicPlayRequest: state.musicPlayRequest + 1,
    musicPlaybackState: 'idle',
  })),
  setMusicSelectedId: (musicSelectedId) => set({ musicSelectedId, musicPreviewItem: null }),
  setMusicMinimized: (musicMinimized) => set({ musicMinimized }),
  setMusicPlaybackState: (musicPlaybackState) => set({ musicPlaybackState }),
  returnToTitle: () => set({ entryState: 'title', autoResumeEnabled: false, musicSelectedId: null, musicPreviewItem: null, musicMinimized: false, musicPlayRequest: 0 }),
  resetAll: () => set({ activeSection: 'inicio', autoResumeEnabled: true, musicSelectedId: null, musicPreviewItem: null, musicMinimized: false, musicPlayRequest: 0, musicPlaybackState: 'idle' }),
}));
