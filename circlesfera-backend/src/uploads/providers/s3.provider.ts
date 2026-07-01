import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider } from '../interfaces/storage-provider.interface.js';
import { UploadedFile } from '../interfaces/uploaded-file.interface.js';

@Injectable()
export class S3Provider implements StorageProvider {
  private readonly logger = new Logger(S3Provider.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly cdnUrl?: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    this.region = this.configService.getOrThrow<string>('AWS_S3_REGION');
    this.cdnUrl = this.configService.get<string>('CDN_URL');

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
  }

  async upload(file: UploadedFile): Promise<{ url: string; type: string }> {
    const isImage = file.mimetype.startsWith('image/');
    const type = isImage
      ? 'image'
      : file.mimetype.startsWith('video')
        ? 'video'
        : 'other';

    // Generate a unique key for the file
    const fileExt = file.originalname.split('.').pop();
    const key = `circlesfera/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    try {
      this.logger.debug(`Uploading file to S3: ${key}`);

      const parallelUploads3 = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: 'public-read', // Ensure it's publicly readable by default for social media
        },
      });

      await parallelUploads3.done();

      // Generate the URL. Use CDN URL if configured, otherwise standard S3 URL.
      const url = this.cdnUrl
        ? `${this.cdnUrl}/${key}`
        : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

      this.logger.log(`File uploaded successfully to S3: ${url}`);

      return {
        url,
        type,
      };
    } catch (error: unknown) {
      this.logger.error(`S3 Upload Error for ${key}:`, error);
      throw new Error(
        `Failed to upload to S3: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async delete(url: string): Promise<void> {
    try {
      // Extract key from URL
      let key = '';
      if (this.cdnUrl && url.startsWith(this.cdnUrl)) {
        key = url.replace(`${this.cdnUrl}/`, '');
      } else {
        // Standard S3 URL parsing
        const parts = url.split('.amazonaws.com/');
        if (parts.length > 1) {
          key = parts[1];
        } else {
          // Fallback: try to find circlesfera/ prefix
          const index = url.indexOf('circlesfera/');
          if (index !== -1) {
            key = url.substring(index);
          }
        }
      }

      if (!key) {
        this.logger.warn(`Could not extract S3 key from URL: ${url}`);
        return;
      }

      this.logger.debug(`Deleting file from S3: ${key}`);
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      this.logger.error(`S3 Delete Error for ${url}:`, error);
    }
  }
}
