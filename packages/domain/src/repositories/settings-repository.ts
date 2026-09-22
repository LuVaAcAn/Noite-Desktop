import type { LocalSettings, ProfileId } from '../entities/local-settings';

export interface BackupCounts {
  libraryItems: number;
  plans: number;
  reviews: number;
  tracks: number;
  savedMusic: number;
  attachments: number;
}

export interface BackupManifest {
  coupleNames?: [string, string] | null;
  format: 'noche';
  version: number;
  exportedAt: string | null;
  counts: BackupCounts;
}

export interface ImportPreview {
  manifest: BackupManifest;
  warnings: string[];
}

export interface ExportBackupResult {
  manifest: BackupManifest;
  contents: string;
  suggestedFileName: string;
}

export interface ImportBackupResult {
  manifest: BackupManifest;
  recoveryBackupCreated: boolean;
}

export interface SettingsRepository {
  get(): Promise<LocalSettings>;
  update(patch: Partial<LocalSettings>): Promise<LocalSettings>;
  setActiveActor(profileId: ProfileId): Promise<LocalSettings>;
  addCategory(category: { label: string; icon: string; colorHex: string }): Promise<LocalSettings>;
  updateCategory(categoryId: string, patch: { label: string; icon: string; colorHex: string }): Promise<LocalSettings>;
  categoryUsage(categoryId: string): Promise<number>;
  removeCategory(categoryId: string): Promise<{ settings: LocalSettings; reclassifiedCount: number }>;

  /** Vuelca todo lo guardado (settings + biblioteca + planes + reseñas +
   * adjuntos) a un único JSON — sección "Exportar mis datos" en Ajustes. */
  exportBackup(): Promise<ExportBackupResult>;
  previewImport(json: string): Promise<ImportPreview>;
  /** Reemplaza todo lo guardado por el contenido de un export previo. */
  importBackup(json: string): Promise<ImportBackupResult>;
}
