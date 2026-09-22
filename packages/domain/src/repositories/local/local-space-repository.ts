import type { SpaceRepository } from '../space-repository';
import type { Space, SpaceMember } from '../../entities/space';
import { localStore, LOCAL_SPACE_ID } from '../../local/local-store';

/** Configuración del espacio y sus perfiles en este equipo. */
export class LocalSpaceRepository implements SpaceRepository {
  async getMine(): Promise<Space | null> {
    const state = await localStore.ensureLoaded();
    return {
      id: LOCAL_SPACE_ID,
      name: state.settings.spaceName,
      themeKey: 'noche_calida',
      coverPath: null,
      significantDate: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      createdBy: state.settings.profiles.primary.id,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async members(): Promise<SpaceMember[]> {
    const state = await localStore.ensureLoaded();
    const members: SpaceMember[] = [
      { spaceId: LOCAL_SPACE_ID, userId: state.settings.profiles.primary.id, role: 'owner', joinedAt: new Date(0).toISOString(), leftAt: null, displayName: state.settings.userName || 'Tú' },
    ];
    if (state.settings.partnerName) {
      members.push({
        spaceId: LOCAL_SPACE_ID,
        userId: state.settings.profiles.partner.id,
        role: 'member',
        joinedAt: new Date(0).toISOString(),
        leftAt: null,
        displayName: state.settings.partnerName,
      });
    }
    return members.map((member) => member.userId === state.settings.profiles.primary.id
      ? { ...member, avatarPath: state.settings.userAvatarPath, avatarUrl: state.settings.userAvatarUrl }
      : { ...member, avatarPath: state.settings.partnerAvatarPath, avatarUrl: state.settings.partnerAvatarUrl });
  }

  async create(name: string): Promise<Space> {
    await localStore.ensureLoaded();
    await localStore.set('settings', { ...localStore.get('settings'), spaceName: name });
    return this.getMine() as Promise<Space>;
  }

}
