export const REVIEW_COLLAPSE_LENGTH = 250;

export function reviewGraphemes(value: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (...args: unknown[]) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return Array.from(new Segmenter('es', { granularity: 'grapheme' }).segment(value), (part) => part.segment);
  return Array.from(value);
}

export function collapsedReview(value: string, expanded: boolean) {
  const graphemes = reviewGraphemes(value);
  const truncated = graphemes.length > REVIEW_COLLAPSE_LENGTH;
  return {
    text: truncated && !expanded ? `${graphemes.slice(0, REVIEW_COLLAPSE_LENGTH).join('')}…` : value,
    truncated,
  };
}

export function completedDateLabel(completedAt: string | null | undefined) {
  if (!completedAt) return 'Fecha no registrada';
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return 'Fecha no registrada';
  return `Realizada el ${new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)}`;
}
