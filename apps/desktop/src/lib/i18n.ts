import type { Locale } from '@proyecto-noche/domain';

export const es = {
  games: 'Juegos', movies: 'Películas', series: 'Series', favorites: 'Favoritos', music: 'Música', calendar: 'Calendario',
  library: 'Biblioteca', destination: '¿No saben qué elegir?', searchActivity: 'Buscar actividad', back: 'Volver', home: 'Inicio',
  upcomingPlans: 'Próximos planes', noUpcomingPlans: 'No hay planes próximos.', actingAs: 'Actuando como', settings: 'Ajustes', returnToTitle: 'Volver al título',
  recentActivities: 'Actividades recientes', allActivities: 'Todas las actividades', newActivity: 'Nueva actividad',
  saveLater: 'Guardar para después', registerMemory: 'Registrar un recuerdo', cancel: 'Cancelar', save: 'Guardar', continue: 'Continuar',
  spanish: 'Español', english: 'English', profileLanguage: 'Idioma del perfil', replace: 'REEMPLAZAR',
  data: 'Datos', passwords: 'Contraseñas', appearance: 'Apariencia', profile: 'Perfil', archive: 'Archivo', controls: 'Controles',
  addMusic: 'Agregar música', play: 'Reproducir', pause: 'Pausar', volume: 'Volumen',
} as const;

export type TranslationKey = keyof typeof es;

export const en: Record<TranslationKey, string> = {
  games: 'Games', movies: 'Movies', series: 'Series', favorites: 'Favorites', music: 'Music', calendar: 'Calendar',
  library: 'Library', destination: 'Not sure what to choose?', searchActivity: 'Search activities', back: 'Back', home: 'Home',
  upcomingPlans: 'Upcoming plans', noUpcomingPlans: 'No upcoming plans.', actingAs: 'Using profile', settings: 'Settings', returnToTitle: 'Return to title',
  recentActivities: 'Recent activities', allActivities: 'All activities', newActivity: 'New activity',
  saveLater: 'Save for later', registerMemory: 'Record a memory', cancel: 'Cancel', save: 'Save', continue: 'Continue',
  spanish: 'Spanish', english: 'English', profileLanguage: 'Profile language', replace: 'REPLACE',
  data: 'Data', passwords: 'Passwords', appearance: 'Appearance', profile: 'Profile', archive: 'Archive', controls: 'Controls',
  addMusic: 'Add music', play: 'Play', pause: 'Pause', volume: 'Volume',
};

export function translate(locale: Locale | undefined, key: TranslationKey) {
  return (locale === 'en' ? en : es)[key];
}

export function dateLocale(locale: Locale | undefined) { return locale === 'en' ? 'en-US' : 'es-PE'; }
