import type { Attachment } from '../entities/memory';

export interface UploadAttachmentInput {
  spaceId: string;
  planItemId: string;
  file: File;
  altText?: string;
}

export interface AttachmentRepository {
  listForPlanItem(planItemId: string): Promise<Attachment[]>;
  listAll(spaceId: string, includeArchived?: boolean): Promise<Attachment[]>;
  upload(input: UploadAttachmentInput): Promise<Attachment>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}
