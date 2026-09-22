import type { CustomCategory, LibraryFilters, LibraryItemKind } from '@proyecto-noche/domain';

export interface ResolvedSection {
  isKnown: boolean;
  title: string;
  subtitle: string;
  filters: LibraryFilters;
  accent: string;
  kindForForm?: LibraryItemKind;
}

const BUILT_IN: Record<string, Omit<ResolvedSection, 'filters' | 'isKnown'> & { kind?: LibraryItemKind; onlyFavorites?: boolean }> = {
  todas: {
    title: 'Actividades',
    subtitle: 'Todo lo que han compartido juntos',
    accent: '#6366F1',
  },
  juegos: {
    title: 'Juegos',
    subtitle: 'Revive todos los juegos que han compartido juntos',
    kind: 'video_game',
    accent: '#0080FF',
  },
  peliculas: {
    title: 'Películas',
    subtitle: 'Revive todas las películas que han compartido juntos',
    kind: 'movie',
    accent: '#FF4D5A',
  },
  series: {
    title: 'Series',
    subtitle: 'Revive todas las series que han compartido juntos',
    kind: 'series',
    accent: '#00A7C7',
  },
  favoritos: {
    title: 'Favoritos',
    subtitle: 'Lo que ambos marcaron con corazón',
    onlyFavorites: true,
    accent: '#DB2777',
  },
};

export function resolveSection(sectionId: string, customCategories: CustomCategory[]): ResolvedSection {
  const builtIn = BUILT_IN[sectionId];
  if (builtIn) {
    return {
      title: builtIn.title,
      isKnown: true,
      subtitle: builtIn.subtitle,
      accent: builtIn.accent,
      kindForForm: builtIn.kind,
      filters: { kind: builtIn.kind, onlyFavorites: builtIn.onlyFavorites },
    };
  }

  const custom = customCategories.find((c) => c.id === sectionId);
  if (custom) {
    return {
      title: custom.label,
      isKnown: true,
      subtitle: `Revive todo lo que registraron en "${custom.label}"`,
      accent: custom.colorHex,
      filters: { customCategoryId: custom.id },
    };
  }

  return {
    title: 'Biblioteca',
    isKnown: false,
    subtitle: 'Todo lo que han compartido juntos',
    accent: '#6366F1',
    filters: {},
  };
}
