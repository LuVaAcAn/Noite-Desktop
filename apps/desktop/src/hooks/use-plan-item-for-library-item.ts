import { useQuery } from '@tanstack/react-query';
import { planRepository } from '../lib/repositories';
import { useSpace } from './use-space';

/**
 * Las valoraciones (reviews) cuelgan de plan_items, no de library_items
 * directamente (sección 12.1: un mismo elemento de biblioteca puede vivir
 * varias veces si se repite en distintos planes). Para la pantalla de
 * detalle simplificada de este prototipo, mostramos la reseña del plan_item
 * más reciente que referencia a este library_item.
 */
export function usePlanItemForLibraryItem(libraryItemId: string | undefined) {
  const { space } = useSpace();

  const plansQuery = useQuery({
    queryKey: ['plans', space?.id],
    queryFn: () => planRepository.list(space!.id),
    enabled: !!space && !!libraryItemId,
  });

  const planItem = plansQuery.data
    ?.flatMap((plan) => plan.items)
    .filter((item) => item.libraryItemId === libraryItemId)
    .sort((a, b) => {
      const aOpen = a.status === 'completed' ? 0 : 1;
      const bOpen = b.status === 'completed' ? 0 : 1;
      return bOpen - aOpen || (b.completedAt ?? b.startedAt ?? '').localeCompare(a.completedAt ?? a.startedAt ?? '');
    })[0];

  return { planItem: planItem ?? null, isLoading: plansQuery.isLoading };
}
