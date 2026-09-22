import type { AppColorMode, SectionAppearance } from '@proyecto-noche/domain';

export const DEFAULT_SECTION_APPEARANCES: Record<string, SectionAppearance> = {
  home: { preset: 'default', accent: '#a855f7', gradientFrom: '#050407', gradientTo: '#1b0b2c', backgroundImagePath: null, dimPercent: 14, blurPx: 0, contrastPercent: 105, saturationPercent: 108, dark: true },
  juegos: { preset: 'default', accent: '#a855f7', gradientFrom: '#050407', gradientTo: '#1b0b2c', backgroundImagePath: null, dimPercent: 14, blurPx: 0, contrastPercent: 105, saturationPercent: 108, dark: true },
  peliculas: { preset: 'default', accent: '#ef3340', gradientFrom: '#050505', gradientTo: '#210609', backgroundImagePath: null, dimPercent: 18, blurPx: 0, contrastPercent: 108, saturationPercent: 108, dark: true },
  series: { preset: 'default', accent: '#168cff', gradientFrom: '#04070d', gradientTo: '#061b32', backgroundImagePath: null, dimPercent: 18, blurPx: 0, contrastPercent: 108, saturationPercent: 108, dark: true },
  favoritos: { preset: 'default', accent: '#a855f7', gradientFrom: '#050407', gradientTo: '#1b0b2c', backgroundImagePath: null, dimPercent: 14, blurPx: 0, contrastPercent: 105, saturationPercent: 108, dark: true },
  musica: { preset: 'default', accent: '#10b981', gradientFrom: '#06110c', gradientTo: '#103b2b', backgroundImagePath: null, dimPercent: 14, blurPx: 0, contrastPercent: 105, saturationPercent: 110, dark: true },
  destino: { preset: 'default', accent: '#168cff', gradientFrom: '#04070d', gradientTo: '#082746', backgroundImagePath: null, dimPercent: 14, blurPx: 0, contrastPercent: 105, saturationPercent: 110, dark: true },
  item: { preset: 'default', accent: '#38bdf8', gradientFrom: '#05070b', gradientTo: '#101827', backgroundImagePath: null, dimPercent: 20, blurPx: 0, contrastPercent: 108, saturationPercent: 105, dark: true },
  calendario: { preset: 'default', accent: '#a855f7', gradientFrom: '#050407', gradientTo: '#1b0b2c', backgroundImagePath: null, dimPercent: 14, blurPx: 0, contrastPercent: 105, saturationPercent: 108, dark: true },
  settings: { preset: 'default', accent: '#a855f7', gradientFrom: '#050407', gradientTo: '#1b0b2c', backgroundImagePath: null, dimPercent: 14, blurPx: 0, contrastPercent: 105, saturationPercent: 108, dark: true },
};

export function sectionKeyFromPath(pathname: string): string {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/musica')) return 'musica';
  if (pathname.startsWith('/sesion')) return 'destino';
  if (pathname.startsWith('/calendario')) return 'calendario';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/actividades/nueva') || pathname.startsWith('/biblioteca/nueva') || pathname.startsWith('/biblioteca/item/')) return 'item';
  const match = pathname.match(/^\/biblioteca\/([^/]+)/);
  return match?.[1] ?? 'home';
}

export function defaultAppearance(key: string, accent = '#a855f7', colorMode: AppColorMode = 'light'): SectionAppearance {
  const dark = DEFAULT_SECTION_APPEARANCES[key] ?? { preset: 'default', accent, gradientFrom: '#050407', gradientTo: '#1b0b2c', backgroundImagePath: null, dimPercent: 14, blurPx: 0, contrastPercent: 105, saturationPercent: 108, dark: true };
  const resolved = { ...dark, accent: key in DEFAULT_SECTION_APPEARANCES ? dark.accent : accent };
  return colorMode !== 'light' ? resolved : {
    ...resolved,
    gradientFrom: '#ffffff',
    gradientTo: key === 'peliculas' ? '#ffe7e9' : key === 'series' || key === 'destino' ? '#e3f1ff' : key === 'musica' ? '#e5f8ee' : '#f3e8ff',
    dimPercent: 0,
    contrastPercent: 100,
    saturationPercent: 100,
    dark: false,
  };
}

export function accentFromColorClass(colorClass: string | undefined) {
  const colors: Record<string, string> = { 'bg-emerald-500': '#10b981', 'bg-cyan-500': '#06b6d4', 'bg-violet-500': '#8b5cf6', 'bg-rose-500': '#f43f5e', 'bg-lime-500': '#84cc16', 'bg-indigo-500': '#6366f1' };
  return colors[colorClass ?? ''] ?? '#6366f1';
}

export function accentFromCategoryColor(colorHex: string | undefined) {
  return colorHex && /^#[0-9a-f]{6}$/i.test(colorHex) ? colorHex : '#6366f1';
}

export function hexRgb(hex: string): string {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3 ? normalized.split('').map((character) => character + character).join('') : normalized;
  const number = Number.parseInt(value, 16);
  if (!Number.isFinite(number)) return '99 102 241';
  return `${(number >> 16) & 255} ${(number >> 8) & 255} ${number & 255}`;
}
