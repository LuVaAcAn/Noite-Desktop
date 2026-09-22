export const CATEGORY_COLOR_PRESETS = [
  '#059669', '#0891B2', '#7C3AED', '#E11D48', '#65A30D', '#4F46E5',
  '#EA580C', '#DB2777', '#0284C7', '#0D9488', '#9333EA', '#CA8A04',
] as const;

export const LEGACY_CATEGORY_COLORS: Record<string, string> = {
  'bg-emerald-500': '#10B981',
  'bg-cyan-500': '#06B6D4',
  'bg-violet-500': '#8B5CF6',
  'bg-rose-500': '#F43F5E',
  'bg-lime-500': '#84CC16',
  'bg-indigo-500': '#6366F1',
  'bg-amber-500': '#F59E0B',
};

export function normalizeCategoryColor(value: string | undefined): string {
  const candidate = value?.trim();
  if (candidate && /^#[0-9a-f]{6}$/i.test(candidate)) return candidate.toUpperCase();
  return LEGACY_CATEGORY_COLORS[candidate ?? ''] ?? '#6366F1';
}

export function categoryTextColor(colorHex: string): '#FFFFFF' | '#111827' {
  const hex = normalizeCategoryColor(colorHex).slice(1);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.42 ? '#111827' : '#FFFFFF';
}

export function splitGraphemes(value: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (...args: unknown[]) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (part) => part.segment);
  return Array.from(value);
}

export function isSingleEmoji(value: string): boolean {
  const trimmed = value.trim();
  return splitGraphemes(trimmed).length === 1 && /\p{Extended_Pictographic}/u.test(trimmed);
}

export function validateCategoryInput(input: { label: string; icon: string; colorHex: string }) {
  const label = input.label.trim();
  if (label.length < 1 || label.length > 40) throw new Error('El nombre debe tener entre 1 y 40 caracteres.');
  if (!isSingleEmoji(input.icon)) throw new Error('Elige un solo emoji.');
  if (!/^#[0-9a-f]{6}$/i.test(input.colorHex)) throw new Error('El color no es válido.');
  return { label, icon: input.icon.trim(), colorHex: normalizeCategoryColor(input.colorHex) };
}
