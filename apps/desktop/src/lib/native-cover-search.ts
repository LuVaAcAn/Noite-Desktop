import { invoke } from './invoke';
import { CoverSearchError, type CoverSearchResult, type CoverSearchService, type LibraryItemKind } from '@proyecto-noche/domain';

export interface CoverCredentialStatus { tmdbConfigured: boolean; igdbConfigured: boolean }

function mappedError(cause: unknown) {
  if (typeof cause === 'object' && cause && 'code' in cause && 'message' in cause) {
    const value = cause as { code: string; message: string };
    return new CoverSearchError(value.code as any, value.message);
  }
  return new CoverSearchError('provider_unavailable', typeof cause === 'string' ? cause : 'No se pudo buscar la portada.');
}

export class NativeCoverSearchService implements CoverSearchService {
  async search(query: string, kind: LibraryItemKind): Promise<CoverSearchResult[]> {
    if (!('__TAURI_INTERNALS__' in window)) throw new CoverSearchError('provider_unavailable', 'La búsqueda está disponible en la aplicación de escritorio.');
    try { return await invoke<CoverSearchResult[]>('search_cover', { query, kind }); }
    catch (cause) { throw mappedError(cause); }
  }
}

export async function getCoverCredentialStatus() {
  if (!('__TAURI_INTERNALS__' in window)) return { tmdbConfigured: false, igdbConfigured: false };
  return invoke<CoverCredentialStatus>('cover_credential_status');
}

export async function saveCoverCredentials(input: { tmdbApiKey?: string; igdbClientId?: string; igdbClientSecret?: string }) {
  try { return await invoke<CoverCredentialStatus>('save_cover_credentials', input); }
  catch (cause) { throw mappedError(cause); }
}

export async function clearCoverCredentials(provider: 'tmdb' | 'igdb') {
  try { return await invoke<CoverCredentialStatus>('clear_cover_credentials', { provider }); }
  catch (cause) { throw mappedError(cause); }
}

export async function testCoverCredentials(provider: 'tmdb' | 'igdb') {
  try { await invoke('test_cover_credentials', { provider }); }
  catch (cause) { throw mappedError(cause); }
}
