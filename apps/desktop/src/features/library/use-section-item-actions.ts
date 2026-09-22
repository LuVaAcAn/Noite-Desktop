import { useMemo, useState } from 'react';
import type { LibraryItem } from '@proyecto-noche/domain';
import { useArchiveLibraryItem, useCompleteLibraryItem, useRestoreLibraryItem, useToggleFavorite, useUpdateLibraryItem } from '../../hooks/use-library';

export function useSectionItemActions(items: LibraryItem[] | undefined) {
  const toggleFavorite = useToggleFavorite();
  const updateItem = useUpdateLibraryItem();
  const archiveItem = useArchiveLibraryItem();
  const restoreItem = useRestoreLibraryItem();
  const completeItem = useCompleteLibraryItem();
  const [menu, setMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [coverSearchItemId, setCoverSearchItemId] = useState<string | null>(null);
  const [lastArchived, setLastArchived] = useState<LibraryItem | null>(null);

  const activeItem = useMemo(() => items?.find((i) => i.id === menu?.itemId) ?? null, [items, menu]);
  const coverSearchItem = useMemo(() => items?.find((i) => i.id === coverSearchItemId) ?? null, [items, coverSearchItemId]);

  return {
    toggleFavorite,
    updateItem,
    completeItem,
    archiveItem: {
      mutate: (id: string) => archiveItem.mutate(id, { onSuccess: () => setLastArchived(items?.find((item) => item.id === id) ?? null) }),
    },
    lastArchived,
    dismissArchive: () => setLastArchived(null),
    undoArchive: () => {
      if (!lastArchived) return;
      restoreItem.mutate(lastArchived.id, { onSuccess: () => setLastArchived(null) });
    },
    menu,
    setMenu,
    activeItem,
    coverSearchItemId,
    setCoverSearchItemId,
    coverSearchItem,
  };
}
