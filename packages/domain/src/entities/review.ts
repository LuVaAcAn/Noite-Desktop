// Entidades Review / SharedReview — PRD sección 12.1 y 6.10 "Valoraciones y comentarios"

import type { MemoryTrack } from './memory';

export interface Review {
  id: string;
  spaceId: string;
  planItemId: string;
  userId: string;
  rating: number | null;
  comment: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SharedReview {
  planItemId: string;
  spaceId: string;
  comment: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface UpsertReviewInput {
  spaceId: string;
  planItemId: string;
  rating?: number;
  comment?: string;
  tags?: string[];
}

/** Ficha completa de un elemento tras vivirlo, tal como se muestra en la
 * pantalla de detalle (7.6) — combina ambas reviews individuales, la
 * conjunta, la canción asociada y las imágenes. */
export interface ReviewSummary {
  planItemId: string;
  reviews: Review[];
  sharedReview: SharedReview | null;
  averageRating: number | null;
  track: MemoryTrack | null;
}
