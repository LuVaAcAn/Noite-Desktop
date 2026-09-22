import type { LibraryItemKind } from './library-item';

export type CoverSearchProvider = 'tmdb' | 'igdb';

export interface CoverSearchResult {
  externalId: string;
  externalProvider: CoverSearchProvider;
  title: string;
  year?: string;
  coverUrl: string | null;
  overview?: string;
  providerLabel: string;
  sourceUrl: string;
  attribution: string;
}

export type CoverSearchErrorCode = 'auth_required' | 'provider_not_configured' | 'provider_auth_failed' | 'provider_rate_limited' | 'provider_timeout' | 'provider_unavailable' | 'invalid_request';

export class CoverSearchError extends Error {
  constructor(
    public code: CoverSearchErrorCode,
    message: string,
    public provider: CoverSearchProvider | null = null,
    public httpStatus: number | null = null,
    public retryAfterSeconds: number | null = null,
    public requestId: string | null = null,
  ) { super(message); this.name = 'CoverSearchError'; }
}

/** Tipos de LibraryItem para los que existe un proveedor automático de
 * portadas. El resto (lectura, conversación temática, actividad creativa,
 * etc.) no tiene una base de datos externa razonable — se cubren con
 * "Adjuntar portada" manual. */
export const COVER_SEARCH_SUPPORTED_KINDS: LibraryItemKind[] = [
  'movie',
  'series',
  'season_or_episode',
  'video_game',
  'browser_game',
];

export function providerForKind(kind: LibraryItemKind): CoverSearchProvider | null {
  if (kind === 'movie' || kind === 'series' || kind === 'season_or_episode') return 'tmdb';
  if (kind === 'video_game' || kind === 'browser_game') return 'igdb';
  return null;
}
