
export type SpaceMemberRole = 'owner' | 'member';

export interface Space {
  id: string;
  name: string;
  themeKey: string;
  coverPath: string | null;
  significantDate: string | null;
  timezone: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceMember {
  spaceId: string;
  userId: string;
  role: SpaceMemberRole;
  joinedAt: string;
  leftAt: string | null;
  displayName?: string;
  avatarPath?: string | null;
  avatarUrl?: string | null;
}
