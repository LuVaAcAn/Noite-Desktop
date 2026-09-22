import type { ReviewSummary, UpsertReviewInput } from '../entities/review';
import type { MemoryTrack, SpotifyTrack } from '../entities/memory';

export interface ReviewRepository {
  upsert(input: UpsertReviewInput): Promise<ReviewSummary>;
  getForPlanItem(planItemId: string): Promise<ReviewSummary>;
  setTrack(planItemId: string, spotifyUrlOrTitle: string): Promise<MemoryTrack>;
  setSpotifyTrack(planItemId: string, track: SpotifyTrack): Promise<MemoryTrack>;
  removeTrack(planItemId: string): Promise<void>;
  listTracks(spaceId: string): Promise<MemoryTrack[]>;
}
