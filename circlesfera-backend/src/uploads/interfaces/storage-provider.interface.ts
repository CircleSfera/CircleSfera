import type { UploadedFile } from './uploaded-file.interface.js';

export interface StorageFileMeta {
  url: string;
  lastModified?: Date;
  sizeBytes?: number;
}

export interface StorageProvider {
  // Uploads a file and returns its public URL and metadata.
  upload(file: UploadedFile): Promise<{ url: string; type: string }>;

  // Deletes a file from storage.
  delete(url: string): Promise<void>;

  // (Optional) Generates a signed URL for secure access.
  getSignedUrl?(key: string): Promise<string>;

  // (Optional) Lists files stored in the provider for reconciliation and audit.
  listFiles?(): Promise<StorageFileMeta[]>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
