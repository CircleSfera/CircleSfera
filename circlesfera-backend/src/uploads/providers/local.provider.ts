import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { StorageProvider } from '../interfaces/storage-provider.interface.js';
import type { UploadedFile } from '../interfaces/uploaded-file.interface.js';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly uploadDir = path.resolve(process.cwd(), 'uploads');

  constructor() {
    this.logger.log(
      `Initializing LocalStorageProvider. Root uploads dir: ${this.uploadDir}`,
    );

    try {
      if (!fs.existsSync(this.uploadDir)) {
        this.logger.log(`Creating uploads directory: ${this.uploadDir}`);
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }

      // Mandatory write test on startup
      const testFile = path.join(this.uploadDir, '.startup-test');
      fs.writeFileSync(testFile, 'CircleSfera Write Test');
      fs.unlinkSync(testFile);
      this.logger.log('Local uploads directory is verified as WRITABLE.');
    } catch (error: unknown) {
      this.logger.error(
        `CRITICAL FAILURE: Upload directory is NOT writable or cannot be created: ${this.uploadDir}`,
      );
      this.logger.error(error instanceof Error ? error.stack : String(error));
      // Re-throwing could crash the whole app provider, so we only log a critical warning
    }
  }

  async upload(file: UploadedFile): Promise<{ url: string; type: string }> {
    const isImage = file.mimetype.startsWith('image/');
    const ext = isImage ? '.webp' : path.extname(file.originalname);
    const filename = `${randomUUID()}${ext}`;
    const filepath = path.join(this.uploadDir, filename);

    const buffer = file.buffer;

    try {
      this.logger.debug(`Writing file to local fs: ${filepath}`);
      await fs.promises.writeFile(filepath, buffer);

      const url = `/uploads/${filename}`;
      this.logger.log(`Stored file local successfully: ${filename}`);

      return {
        url,
        type: isImage
          ? 'image'
          : file.mimetype.startsWith('video')
            ? 'video'
            : 'other',
      };
    } catch (error: unknown) {
      this.logger.error(
        `Critical storage error writing ${filename} to ${this.uploadDir}`,
      );
      this.logger.error(error instanceof Error ? error.stack : String(error));

      const errMsg =
        error instanceof Error ? error.message : 'Unknown storage error';
      throw new Error(
        `LocalStorage Error: ${errMsg}. Please verify host disk permissions (chown 1000:1000).`,
      );
    }
  }

  async delete(url: string): Promise<void> {
    try {
      const filename = path.basename(url);
      const filepath = path.join(this.uploadDir, filename);
      if (fs.existsSync(filepath)) {
        await fs.promises.unlink(filepath);
      }
    } catch (error) {
      console.error('Failed to delete local file:', error);
    }
  }
}
