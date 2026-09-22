import type { Space, SpaceMember } from '../entities/space';

export interface SpaceRepository {
  getMine(): Promise<Space | null>;
  members(spaceId: string): Promise<SpaceMember[]>;
  create(name: string): Promise<Space>;
}
