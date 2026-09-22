import type { LibraryItemKind } from '../entities/library-item';
import type { CoverSearchResult } from '../entities/cover-search';

export interface CoverSearchService {
  search(query: string, kind: LibraryItemKind): Promise<CoverSearchResult[]>;
}
