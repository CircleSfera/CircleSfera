import { Readable } from 'node:stream';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { StorageProvider } from '../interfaces/storage-provider.interface.js';
import type { UploadedFile } from '../interfaces/uploaded-file.interface.js';

@Injectable()
export class CloudinaryProvider implements StorageProvider {
  private readonly logger = new Logger(CloudinaryProvider.name);
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async upload(file: UploadedFile): Promise<{ url: string; type: string }> {
    return new Promise((resolve, reject) => {
      const type = file.mimetype.startsWith('video')
        ? 'video'
        : file.mimetype.startsWith('audio')
          ? 'audio'
          : 'image';

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: 'circlesfera',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error) return reject(new Error(error.message));
          if (result) {
            resolve({
              url: result.secure_url,
              type,
            });
          }
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  ownsUrl(url: string): boolean {
    const cloud = this.configService.get<string>('CLOUDINARY_NAME');
    if (!cloud || !/^[a-z0-9_-]+$/i.test(cloud)) return false;
    // As uploads name them: the account, the kind, an optional version and
    // the folder of CircleSfera.
    return new RegExp(
      `^https://res\\.cloudinary\\.com/${cloud}/(image|video|raw)/upload/(v\\d+/)?circlesfera/[A-Za-z0-9_-]+\\.[a-z0-9]{2,5}$`,
    ).test(url);
  }

  async delete(url: string): Promise<void> {
    // Only an address this storage answers for one of its own files is
    // deleted: any other shape (another folder, a trailing slash, a host)
    // could still name someone else's file by its base name.
    if (!this.ownsUrl(url)) {
      this.logger.warn(`Not deleting ${url}: not an address of this storage`);
      return;
    }
    try {
      const parts = url.split('/');
      const filenameWithExt = parts[parts.length - 1];
      const publicId = `circlesfera/${filenameWithExt.split('.')[0]}`;

      const result = await cloudinary.uploader.destroy(publicId);
      if (result && result.result !== 'ok' && result.result !== 'not found') {
        throw new Error(
          `Cloudinary deletion failed with result: ${result.result}`,
        );
      }
    } catch (error: unknown) {
      console.error('Failed to delete from Cloudinary:', error);
      throw error;
    }
  }
}
