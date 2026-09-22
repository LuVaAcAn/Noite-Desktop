// Entidades Plan / PlanItem — PRD sección 12.1 `plans` / `plan_items`

import type { LibraryItemKind, LibraryItemStatus } from './library-item';

export type PlanStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface PlanItem {
  id: string;
  planId: string;
  libraryItemId: string | null;
  titleSnapshot: string;
  kindSnapshot: LibraryItemKind;
  position: number;
  status: LibraryItemStatus;
  estimatedMinutes: number | null;
  isPrimary: boolean;
  isOptional: boolean;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Plan {
  id: string;
  spaceId: string;
  title: string;
  status: PlanStatus;
  startsAt: string | null;
  estimatedMinutes: number | null;
  notes: string | null;
  coverPath: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  items: PlanItem[];
}

export interface CreatePlanInput {
  spaceId: string;
  title: string;
  startsAt?: string;
  notes?: string;
  libraryItemIds?: string[];
}

export interface UpdatePlanInput {
  title?: string;
  startsAt?: string | null;
  notes?: string | null;
  libraryItemIds?: string[];
}

export interface AddPlanItemInput {
  libraryItemId?: string;
  titleSnapshot: string;
  kindSnapshot: LibraryItemKind;
  estimatedMinutes?: number;
  isPrimary?: boolean;
  isOptional?: boolean;
  notes?: string;
}
