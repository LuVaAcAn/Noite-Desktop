import type { AttachmentRepository, UploadAttachmentInput } from '../attachment-repository';
import type { Attachment } from '../../entities/memory';
import { localStore } from '../../local/local-store';
import { persistLocalMedia } from '../../local/local-media';

function id() {
  return `attachment-${Math.random().toString(36).slice(2, 9)}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export class LocalAttachmentRepository implements AttachmentRepository {
  async listForPlanItem(planItemId: string): Promise<Attachment[]> {
    await localStore.ensureLoaded();
    return localStore.get('attachments').filter((a) => a.planItemId === planItemId && !a.archivedAt);
  }

  async listAll(spaceId: string, includeArchived = false): Promise<Attachment[]> {
    await localStore.ensureLoaded();
    return localStore.get('attachments')
      .filter((attachment) => attachment.spaceId === spaceId && (includeArchived || !attachment.archivedAt))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async upload(input: UploadAttachmentInput): Promise<Attachment> {
    await localStore.ensureLoaded();
    const settings = localStore.get('settings');
    // Se guarda como data URL (no como Blob de object-URL, que no sobrevive
    // un reinicio de la app): así el adjunto queda dentro del mismo JSON
    // exportable de "Ajustes → Exportar mis datos".
    const dataUrl = await readAsDataUrl(input.file);
    const persisted = await persistLocalMedia('captures', dataUrl, input.file.name);

    const attachment: Attachment = {
      id: id(),
      spaceId: input.spaceId,
      planItemId: input.planItemId,
      uploadedBy: settings.activeProfileId,
      storagePath: persisted.storagePath,
      mimeType: input.file.type,
      sizeBytes: input.file.size,
      altText: input.altText ?? null,
      createdAt: new Date().toISOString(),
      archivedAt: null,
      resolvedUrl: persisted.resolvedUrl,
    };
    await localStore.set('attachments', [attachment, ...localStore.get('attachments')]);
    return attachment;
  }

  async archive(attachmentId: string): Promise<void> {
    await localStore.ensureLoaded();
    const archivedAt = new Date().toISOString();
    await localStore.set('attachments', localStore.get('attachments').map((attachment) => attachment.id === attachmentId ? { ...attachment, archivedAt } : attachment));
  }

  async restore(attachmentId: string): Promise<void> {
    await localStore.ensureLoaded();
    await localStore.set('attachments', localStore.get('attachments').map((attachment) => attachment.id === attachmentId ? { ...attachment, archivedAt: null } : attachment));
  }

  async remove(attachmentId: string): Promise<void> {
    await localStore.ensureLoaded();
    await localStore.set(
      'attachments',
      localStore.get('attachments').filter((a) => a.id !== attachmentId)
    );
  }
}
