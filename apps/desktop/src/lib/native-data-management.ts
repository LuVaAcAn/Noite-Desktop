import { invoke } from './invoke';
import type { FactoryResetStatus, PurgePreview, PurgeResult } from '@proyecto-noche/domain';

function requireNative() {
  if (!('__TAURI_INTERNALS__' in window)) throw new Error('La eliminación permanente solo está disponible en la aplicación de escritorio.');
}

export function previewActivityPurge(libraryItemId: string) { requireNative(); return invoke<PurgePreview>('preview_activity_purge', { libraryItemId }); }
export function previewAttachmentPurge(attachmentId: string) { requireNative(); return invoke<PurgePreview>('preview_attachment_purge', { attachmentId }); }
export function previewArchivePurge() { requireNative(); return invoke<PurgePreview>('preview_archive_purge'); }
export function purgeArchivedActivity(libraryItemId: string, confirmation: string) { requireNative(); return invoke<PurgeResult>('purge_archived_activity', { libraryItemId, confirmation }); }
export function purgeArchivedAttachment(attachmentId: string, confirmation: string) { requireNative(); return invoke<PurgeResult>('purge_archived_attachment', { attachmentId, confirmation }); }
export function purgeAllArchived(confirmation: string) { requireNative(); return invoke<PurgeResult>('purge_all_archived', { confirmation }); }
export async function factoryReset(confirmation: string) { requireNative(); const result = await invoke<FactoryResetStatus>('factory_reset', { confirmation }); localStorage.removeItem('noite.device-profile'); return result; }
export function clearRegenerableCache() { requireNative(); return invoke<{ removedFiles: number; removedBytes: number }>('clear_regenerable_cache'); }
export function previewRegenerableCache() { requireNative(); return invoke<{ removedFiles: number; removedBytes: number }>('preview_regenerable_cache'); }
