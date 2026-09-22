import { useQuery } from '@tanstack/react-query';
import type { Plan } from '@proyecto-noche/domain';
import { planRepository } from '../lib/repositories';
import { useSpace } from './use-space';

/**
 * Punto 6 del feedback: la campana no hacía nada. En vez de simularla con
 * datos falsos, se conecta a algo real que ya existe — los planes con
 * fecha (`plans.startsAt`) que todavía no pasaron. Cuando se implemente el
 * calendario mensual completo, esta misma fuente de datos sirve para los
 * recordatorios reales.
 */
export function useUpcomingPlanReminders(): Plan[] {
  const { space } = useSpace();
  const query = useQuery({
    queryKey: ['plans', space?.id, 'reminders'],
    queryFn: () => planRepository.list(space!.id),
    enabled: !!space,
  });

  return upcomingPlanReminders(query.data ?? [], Date.now());
}

export function upcomingPlanReminders(plans: Plan[], now: number): Plan[] {
  return plans
    .filter((plan) => plan.startsAt && new Date(plan.startsAt).getTime() >= now && plan.status !== 'cancelled' && plan.status !== 'completed')
    .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime())
    .slice(0, 8);
}
