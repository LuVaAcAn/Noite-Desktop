import type { SettingsRepository } from '../settings-repository';
import { profileRoleForId, type CustomCategory, type LocalSettings, type ProfileId } from '../../entities/local-settings';
import { localStore } from '../../local/local-store';
import { rememberDeviceProfile } from '../../local/device-profile';
import { validateCategoryInput } from '../../entities/category-utils';

function id() {
  return `category-${Math.random().toString(36).slice(2, 9)}`;
}

export class LocalSettingsRepository implements SettingsRepository {
  async get(): Promise<LocalSettings> {
    const state = await localStore.ensureLoaded();
    return state.settings;
  }

  async update(patch: Partial<LocalSettings>): Promise<LocalSettings> {
    await localStore.ensureLoaded();
    const current = localStore.get('settings');
    const next = { ...current, ...patch };
    if (patch.locale) {
      const role = profileRoleForId(next, next.activeProfileId) === 'me' ? 'primary' : 'partner';
      next.profiles = { ...next.profiles, [role]: { ...next.profiles[role], locale: patch.locale } };
    }
    if (patch.userName !== undefined) next.profiles = { ...next.profiles, primary: { ...next.profiles.primary, displayName: patch.userName } };
    if (patch.partnerName !== undefined) next.profiles = { ...next.profiles, partner: { ...next.profiles.partner, displayName: patch.partnerName } };
    if (patch.userAvatarUrl !== undefined) next.profiles = { ...next.profiles, primary: { ...next.profiles.primary, avatarUrl: patch.userAvatarUrl } };
    if (patch.partnerAvatarUrl !== undefined) next.profiles = { ...next.profiles, partner: { ...next.profiles.partner, avatarUrl: patch.partnerAvatarUrl } };
    await localStore.set('settings', next);
    return next;
  }

  async setActiveActor(profileId: ProfileId): Promise<LocalSettings> {
    const current = await this.get();
    const profile = Object.values(current.profiles).find((entry) => entry.id === profileId);
    if (!profile) throw new Error('El perfil no pertenece a esta pareja.');
    rememberDeviceProfile(profileId);
    return this.update({ activeProfileId: profileId, locale: profile.locale });
  }

  async addCategory(category: { label: string; icon: string; colorHex: string }): Promise<LocalSettings> {
    await localStore.ensureLoaded();
    const current = localStore.get('settings');
    const validated = validateCategoryInput(category);
    if (current.customCategories.some((entry) => entry.label.localeCompare(validated.label, undefined, { sensitivity: 'accent' }) === 0)) throw new Error('Ya existe una categoría con ese nombre.');
    const newCategory: CustomCategory = {
      id: id(),
      ...validated,
    };
    return this.update({ customCategories: [...current.customCategories, newCategory] });
  }

  async updateCategory(categoryId: string, patch: { label: string; icon: string; colorHex: string }): Promise<LocalSettings> {
    await localStore.ensureLoaded();
    const current = localStore.get('settings');
    if (!current.customCategories.some((entry) => entry.id === categoryId)) throw new Error('Categoría no encontrada.');
    const validated = validateCategoryInput(patch);
    if (current.customCategories.some((entry) => entry.id !== categoryId && entry.label.localeCompare(validated.label, undefined, { sensitivity: 'accent' }) === 0)) throw new Error('Ya existe una categoría con ese nombre.');
    const customCategories = current.customCategories.map((entry) => entry.id === categoryId ? { ...entry, ...validated } : entry);
    const appearance = current.sectionAppearances[categoryId];
    const sectionAppearances = appearance?.preset === 'default'
      ? { ...current.sectionAppearances, [categoryId]: { ...appearance, accent: validated.colorHex } }
      : current.sectionAppearances;
    return this.update({ customCategories, sectionAppearances });
  }

  async categoryUsage(categoryId: string): Promise<number> {
    await localStore.ensureLoaded();
    return localStore.get('libraryItems').filter((item) => item.customCategoryId === categoryId && !item.archivedAt).length;
  }

  async removeCategory(categoryId: string): Promise<{ settings: LocalSettings; reclassifiedCount: number }> {
    await localStore.ensureLoaded();
    const current = localStore.get('settings');
    const settings = {
      ...current,
      customCategories: current.customCategories.filter((c) => c.id !== categoryId),
    };
    let reclassifiedCount = 0;
    const libraryItems = localStore.get('libraryItems').map((item) => {
      if (item.customCategoryId !== categoryId) return item;
      reclassifiedCount += 1;
      return { ...item, kind: 'other' as const, customCategoryId: null, updatedAt: new Date().toISOString() };
    });
    await localStore.commit({ settings, libraryItems });
    return { settings, reclassifiedCount };
  }

  async exportBackup() {
    return localStore.exportBackup();
  }

  async previewImport(json: string) {
    return localStore.previewImport(json);
  }

  async importBackup(json: string) {
    return localStore.importBackup(json);
  }
}
