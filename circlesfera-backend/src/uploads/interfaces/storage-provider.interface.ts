import type { UploadedFile } from './uploaded-file.interface.js';

export interface StorageFileMeta {
  url: string;
  lastModified?: Date;
  sizeBytes?: number;
}

export interface HlsArtifactsResult {
  masterPlaylistUrl: string;
  thumbnailUrl: string;
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

  // (Optional) Stores transcoded HLS directory artifacts (master.m3u8, thumb.jpg, .ts segments)
  // and returns resolved public URLs.
  storeHlsArtifacts?(params: {
    baseName: string;
    outputDir: string;
  }): Promise<HlsArtifactsResult>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
