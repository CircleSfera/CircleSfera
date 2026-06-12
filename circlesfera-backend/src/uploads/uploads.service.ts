import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from './interfaces/storage-provider.interface.js';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';
import { MediaProcessorService } from './media-processor.service.js';

/**
 * Service for file upload and deletion. Delegates to a pluggable StorageProvider.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
    @Inject(MediaProcessorService)
    private readonly mediaProcessor: MediaProcessorService,
  ) {}

  /**
   * Upload a file to the configured storage provider.
   * Processes images into multiple optimized variants (original, standard, thumbnail).
   * @param file - The uploaded file data
   * @returns The public URLs and MIME type of the stored file
   */
  async uploadFile(file: UploadedFile): Promise<{
    url: string;
    standardUrl?: string;
    thumbnailUrl?: string;
    type: string;
  }> {
    this.logger.log(
      `Received upload request for: ${file.originalname} (${file.mimetype})`,
    );

    try {
      const processed = await this.mediaProcessor.process(file);
      const isImage = file.mimetype.startsWith('image/');

      if (isImage) {
        this.logger.debug(`Uploading 3 image variants...`);
        const [orig, std, thumb] = await Promise.all([
          this.storageProvider.upload({
            ...file,
            buffer: processed.original.buffer,
            mimetype: processed.original.mimetype,
          }),
          this.storageProvider.upload({
            ...file,
            buffer: processed.standard.buffer,
            mimetype: processed.standard.mimetype,
          }),
          this.storageProvider.upload({
            ...file,
            buffer: processed.thumbnail.buffer,
            mimetype: processed.thumbnail.mimetype,
          }),
        ]);

        return {
          url: orig.url,
          standardUrl: std.url,
          thumbnailUrl: thumb.url,
          type: orig.type,
        };
      }

      // Non-images (Video/Audio/Docs)
      this.logger.debug(`File processed, handing off to storage provider...`);
      const result = await this.storageProvider.upload({
        ...file,
        buffer: processed.original.buffer,
        mimetype: processed.original.mimetype,
      });

      return result;
    } catch (error: unknown) {
      this.logger.error(
        `Upload flow failed for ${file.originalname}: ${error instanceof Error ? error.stack : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Delete a file from the storage provider by its URL.
   * @param url - The file URL to delete
   */
  async deleteFile(url: string): Promise<void> {
    return this.storageProvider.delete(url);
  }
}
