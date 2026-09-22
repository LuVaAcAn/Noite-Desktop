import { useMutation } from '@tanstack/react-query';
import type { LibraryItemKind } from '@proyecto-noche/domain';
import { coverSearchService } from '../lib/repositories';

export function useCoverSearch() {
  return useMutation({
    mutationFn: ({ query, kind }: { query: string; kind: LibraryItemKind }) =>
      coverSearchService.search(query, kind),
  });
}
