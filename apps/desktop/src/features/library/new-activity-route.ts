import type { CustomCategory } from '@proyecto-noche/domain';

const BUILT_IN_TYPES: Record<string, string> = {
  juegos: 'video_game',
  peliculas: 'movie',
  series: 'series',
};

export function activityTypeForSection(section: string | null, customCategories: CustomCategory[]): string {
  if (!section || section === 'favoritos') return '';
  if (BUILT_IN_TYPES[section]) return BUILT_IN_TYPES[section];
  return customCategories.some((category) => category.id === section) ? `custom:${section}` : '';
}

export function newActivityPath(section?: string | null, fromPlan = false): string {
  const params = new URLSearchParams();
  if (section && section !== 'favoritos') params.set('section', section);
  if (fromPlan) params.set('from', 'plan');
  const query = params.toString();
  return `/actividades/nueva${query ? `?${query}` : ''}`;
}
