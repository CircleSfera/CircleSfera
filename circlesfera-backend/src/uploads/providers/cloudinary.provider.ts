import { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { StorageProvider } from '../interfaces/storage-provider.interface.js';
import type { UploadedFile } from '../interfaces/uploaded-file.interface.js';

@Injectable()
export class CloudinaryProvider implements StorageProvider {
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

  async delete(url: string): Promise<void> {
    try {
      const parts = url.split('/');
      const filenameWithExt = parts[parts.length - 1];
      const publicId = `circlesfera/${filenameWithExt.split('.')[0]}`;

      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error('Failed to delete from Cloudinary:', error);
    }
  }
}
