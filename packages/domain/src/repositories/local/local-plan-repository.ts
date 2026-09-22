import type { PlanRepository } from '../plan-repository';
import type { AddPlanItemInput, CreatePlanInput, Plan, PlanItem, UpdatePlanInput } from '../../entities/plan';
import type { Session } from '../../entities/memory';
import { localStore } from '../../local/local-store';

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export class LocalPlanRepository implements PlanRepository {
  async list(spaceId: string): Promise<Plan[]> {
    await localStore.ensureLoaded();
    return [...localStore.get('plans')]
      .filter((plan) => plan.spaceId === spaceId)
      .sort((a, b) => (a.startsAt ?? a.createdAt).localeCompare(b.startsAt ?? b.createdAt));
  }

  async get(planId: string): Promise<Plan | null> {
    await localStore.ensureLoaded();
    return localStore.get('plans').find((plan) => plan.id === planId) ?? null;
  }

  async create(input: CreatePlanInput): Promise<Plan> {
    await localStore.ensureLoaded();
    const settings = localStore.get('settings');
    const now = new Date().toISOString();
    const planId = id('plan');
    const selected = new Set(input.libraryItemIds ?? []);
    const libraryItems = localStore.get('libraryItems');
    const items: PlanItem[] = libraryItems
      .filter((item) => selected.has(item.id) && !item.archivedAt)
      .map((item, position) => ({
        id: id('planitem'),
        planId,
        libraryItemId: item.id,
        titleSnapshot: item.title,
        kindSnapshot: item.kind,
        position,
        status: 'planned',
        estimatedMinutes: item.estimatedMinutes,
        isPrimary: position === 0,
        isOptional: false,
        notes: null,
        startedAt: null,
        completedAt: null,
      }));
    if (items.length === 0) throw new Error('Elige al menos una actividad para el plan.');

    const plan: Plan = {
      id: planId,
      spaceId: input.spaceId,
      title: input.title,
      status: input.startsAt ? 'scheduled' : 'draft',
      startsAt: input.startsAt ?? null,
      estimatedMinutes: items.reduce((sum, item) => sum + (item.estimatedMinutes ?? 0), 0) || null,
      notes: input.notes ?? null,
      coverPath: null,
      createdBy: settings.activeProfileId,
      updatedBy: settings.activeProfileId,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null,
      items,
    };
    const nextLibrary = libraryItems.map((item) => selected.has(item.id) ? { ...item, status: 'planned' as const, updatedAt: now } : item);
    await localStore.commit({ plans: [plan, ...localStore.get('plans')], libraryItems: nextLibrary });
    return plan;
  }

  async update(planId: string, input: UpdatePlanInput): Promise<Plan> {
    await localStore.ensureLoaded();
    const current = localStore.get('plans').find((plan) => plan.id === planId);
    if (!current) throw new Error('Plan no encontrado');
    const now = new Date().toISOString();
    const libraryItems = localStore.get('libraryItems');
    let planItems = current.items;
    if (input.libraryItemIds) {
      const selected = new Set(input.libraryItemIds);
      if (selected.size === 0) throw new Error('Elige al menos una actividad para el plan.');
      planItems = libraryItems.filter((item) => selected.has(item.id) && !item.archivedAt).map((item, position) => {
        const existing = current.items.find((entry) => entry.libraryItemId === item.id);
        return existing ? { ...existing, position } : { id: id('planitem'), planId, libraryItemId: item.id, titleSnapshot: item.title, kindSnapshot: item.kind, position, status: current.status === 'in_progress' ? 'in_progress' as const : 'planned' as const, estimatedMinutes: item.estimatedMinutes, isPrimary: position === 0, isOptional: false, notes: null, startedAt: current.status === 'in_progress' ? now : null, completedAt: null };
      });
    }
    const { libraryItemIds: _libraryItemIds, ...changes } = input;
    const updated: Plan = {
      ...current,
      ...changes,
      items: planItems,
      status: current.status === 'draft' && input.startsAt ? 'scheduled' : current.status === 'scheduled' && input.startsAt === null ? 'draft' : current.status,
      updatedAt: now,
    };
    const plans = localStore.get('plans').map((plan) => plan.id === planId ? updated : plan);
    if (input.libraryItemIds) {
      const before = new Set(current.items.map((item) => item.libraryItemId).filter(Boolean));
      const after = new Set(planItems.map((item) => item.libraryItemId).filter(Boolean));
      await localStore.commit({ plans, libraryItems: libraryItems.map((item) => after.has(item.id) ? { ...item, status: current.status === 'in_progress' ? 'in_progress' as const : 'planned' as const, updatedAt: now } : before.has(item.id) && (item.status === 'planned' || item.status === 'in_progress') ? { ...item, status: 'pending' as const, updatedAt: now } : item) });
    } else await localStore.set('plans', plans);
    return updated;
  }

  async cancel(planId: string): Promise<Plan> {
    await localStore.ensureLoaded();
    const plan = await this.get(planId);
    if (!plan) throw new Error('Plan no encontrado');
    const now = new Date().toISOString();
    const updated: Plan = { ...plan, status: 'cancelled', cancelledAt: now, updatedAt: now };
    const itemIds = new Set(plan.items.map((item) => item.libraryItemId).filter(Boolean));
    await localStore.commit({
      plans: localStore.get('plans').map((item) => item.id === planId ? updated : item),
      libraryItems: localStore.get('libraryItems').map((item) => itemIds.has(item.id) && (item.status === 'planned' || item.status === 'in_progress')
        ? { ...item, status: 'pending' as const, updatedAt: now }
        : item),
    });
    return updated;
  }

  async complete(planId: string): Promise<Plan> {
    await localStore.ensureLoaded();
    const plan = await this.get(planId);
    if (!plan) throw new Error('Plan no encontrado');
    const now = new Date().toISOString();
    const items = plan.items.map((item) => ({ ...item, status: 'completed' as const, completedAt: item.completedAt ?? now }));
    const updated: Plan = { ...plan, items, status: 'completed', completedAt: now, updatedAt: now };
    const itemIds = new Set(items.map((item) => item.libraryItemId).filter(Boolean));
    await localStore.commit({
      plans: localStore.get('plans').map((item) => item.id === planId ? updated : item),
      libraryItems: localStore.get('libraryItems').map((item) => itemIds.has(item.id)
        ? { ...item, status: 'completed' as const, updatedAt: now }
        : item),
    });
    return updated;
  }

  async addItem(planId: string, input: AddPlanItemInput): Promise<PlanItem> {
    await localStore.ensureLoaded();
    const plan = localStore.get('plans').find((item) => item.id === planId);
    if (!plan) throw new Error('Plan no encontrado');
    const item: PlanItem = {
      id: id('planitem'), planId, libraryItemId: input.libraryItemId ?? null,
      titleSnapshot: input.titleSnapshot, kindSnapshot: input.kindSnapshot,
      position: plan.items.length, status: 'planned', estimatedMinutes: input.estimatedMinutes ?? null,
      isPrimary: input.isPrimary ?? false, isOptional: input.isOptional ?? false,
      notes: input.notes ?? null, startedAt: null, completedAt: null,
    };
    await localStore.set('plans', localStore.get('plans').map((current) => current.id === planId ? { ...current, items: [...current.items, item] } : current));
    return item;
  }

  async reorder(planId: string, orderedIds: string[]): Promise<void> {
    await localStore.ensureLoaded();
    await localStore.set('plans', localStore.get('plans').map((plan) => {
      if (plan.id !== planId) return plan;
      const items = [...plan.items]
        .sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id))
        .map((item, position) => ({ ...item, position }));
      return { ...plan, items };
    }));
  }

  async start(planId: string): Promise<Session> {
    await localStore.ensureLoaded();
    const plan = await this.get(planId);
    if (!plan) throw new Error('Plan no encontrado');
    if (plan.items.length === 0) throw new Error('No se puede iniciar un plan vacío.');
    if (plan.status === 'cancelled' || plan.status === 'completed') throw new Error('Este plan ya está cerrado.');
    const settings = localStore.get('settings');
    const now = new Date().toISOString();
    const itemIds = new Set(plan.items.map((item) => item.libraryItemId).filter(Boolean));
    const session: Session = { id: id('session'), spaceId: plan.spaceId, planId, status: 'active', currentPlanItemId: plan.items[0].id, startedAt: now, endedAt: null, createdBy: settings.activeProfileId, sharedNotes: null };
    await localStore.commit({
      plans: localStore.get('plans').map((item) => item.id === planId
        ? { ...item, status: 'in_progress' as const, items: item.items.map((entry) => ({ ...entry, status: 'in_progress' as const, startedAt: entry.startedAt ?? now })) }
        : item),
      libraryItems: localStore.get('libraryItems').map((item) => itemIds.has(item.id)
        ? { ...item, status: 'in_progress' as const, updatedAt: now }
        : item),
      sessions: [session, ...localStore.get('sessions').filter((entry) => entry.planId !== planId || entry.status !== 'active')],
    });
    return session;
  }

  async completeItem(planItemId: string): Promise<PlanItem> {
    await localStore.ensureLoaded();
    const plan = localStore.get('plans').find((candidate) => candidate.items.some((item) => item.id === planItemId));
    if (!plan) throw new Error('Elemento de plan no encontrado');
    const target = plan.items.find((item) => item.id === planItemId)!;
    const now = new Date().toISOString();
    const updated = { ...target, status: 'completed' as const, completedAt: now };
    const nextItems = plan.items.map((item) => item.id === planItemId ? updated : item);
    const nextPending = nextItems.find((item) => item.status !== 'completed');
    const planCompleted = !nextPending;
    await localStore.commit({
      plans: localStore.get('plans').map((candidate) => candidate.id === plan.id
        ? { ...candidate, items: nextItems, status: planCompleted ? 'completed' as const : candidate.status, completedAt: planCompleted ? now : candidate.completedAt, updatedAt: now }
        : candidate),
      libraryItems: localStore.get('libraryItems').map((item) => item.id === target.libraryItemId
        ? { ...item, status: 'completed' as const, updatedAt: now }
        : item),
      sessions: localStore.get('sessions').map((session) => session.planId === plan.id && session.status === 'active' ? { ...session, status: planCompleted ? 'ended' as const : session.status, endedAt: planCompleted ? now : session.endedAt, currentPlanItemId: nextPending?.id ?? null } : session),
    });
    return updated;
  }

  async recordCompletedActivity(libraryItemId: string): Promise<PlanItem> {
    await localStore.ensureLoaded();
    const existing = localStore.get('plans')
      .flatMap((plan) => plan.items)
      .find((item) => item.libraryItemId === libraryItemId && item.status !== 'completed' && item.status !== 'archived');
    if (existing) return this.completeItem(existing.id);

    const libraryItem = localStore.get('libraryItems').find((item) => item.id === libraryItemId && !item.archivedAt);
    if (!libraryItem) throw new Error('Actividad no encontrada.');
    const settings = localStore.get('settings');
    const now = new Date().toISOString();
    const planId = id('plan');
    const planItem: PlanItem = {
      id: id('planitem'), planId, libraryItemId: libraryItem.id, titleSnapshot: libraryItem.title,
      kindSnapshot: libraryItem.kind, position: 0, status: 'completed', estimatedMinutes: libraryItem.estimatedMinutes,
      isPrimary: true, isOptional: false, notes: null, startedAt: now, completedAt: now,
    };
    const plan: Plan = {
      id: planId, spaceId: libraryItem.spaceId, title: libraryItem.title, status: 'completed', startsAt: now,
      estimatedMinutes: libraryItem.estimatedMinutes, notes: null, coverPath: libraryItem.customCoverPath,
      createdBy: settings.activeProfileId, updatedBy: settings.activeProfileId, createdAt: now, updatedAt: now,
      completedAt: now, cancelledAt: null, items: [planItem],
    };
    await localStore.commit({
      plans: [plan, ...localStore.get('plans')],
      libraryItems: localStore.get('libraryItems').map((item) => item.id === libraryItemId ? { ...item, status: 'completed' as const, updatedAt: now, updatedBy: settings.activeProfileId } : item),
    });
    return planItem;
  }
}
