import type { AddPlanItemInput, CreatePlanInput, Plan, PlanItem, UpdatePlanInput } from '../entities/plan';
import type { Session } from '../entities/memory';

export interface PlanRepository {
  list(spaceId: string): Promise<Plan[]>;
  get(id: string): Promise<Plan | null>;
  create(input: CreatePlanInput): Promise<Plan>;
  update(id: string, input: UpdatePlanInput): Promise<Plan>;
  cancel(id: string): Promise<Plan>;
  complete(id: string): Promise<Plan>;
  addItem(planId: string, input: AddPlanItemInput): Promise<PlanItem>;
  reorder(planId: string, orderedIds: string[]): Promise<void>;
  start(planId: string): Promise<Session>;
  completeItem(planItemId: string): Promise<PlanItem>;
  recordCompletedActivity(libraryItemId: string): Promise<PlanItem>;
}
