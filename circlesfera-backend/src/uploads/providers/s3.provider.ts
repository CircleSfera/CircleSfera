import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type HlsArtifactsResult,
  type StorageFileMeta,
  StorageProvider,
} from '../interfaces/storage-provider.interface.js';

import { UploadedFile } from '../interfaces/uploaded-file.interface.js';
import { mimetypeToExt } from '../mime-to-ext.js';

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

    // Generate an opaque key — never use file.originalname to avoid path manipulation.
    const key = `circlesfera/${randomUUID()}${mimetypeToExt(file.mimetype)}`;

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
    } catch (error: any) {
      if (
        error?.name === 'NoSuchKey' ||
        error?.$metadata?.httpStatusCode === 404
      ) {
        return;
      }
      this.logger.error(`S3 Delete Error for ${url}:`, error);
      throw error;
    }
  }

  async listFiles(): Promise<StorageFileMeta[]> {
    try {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: 'circlesfera/',
        }),
      );

      if (!response.Contents) {
        return [];
      }

      return response.Contents.map((item) => {
        const key = item.Key ?? '';
        const url = this.cdnUrl
          ? `${this.cdnUrl}/${key}`
          : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

        return {
          url,
          lastModified: item.LastModified,
          sizeBytes: item.Size,
        };
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to list files in S3 bucket ${this.bucket}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  async storeHlsArtifacts(params: {
    baseName: string;
    outputDir: string;
  }): Promise<HlsArtifactsResult> {
    const files = await fs.promises.readdir(params.outputDir);

    for (const file of files) {
      const filePath = path.join(params.outputDir, file);
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) continue;

      const buffer = await fs.promises.readFile(filePath);
      const ext = path.extname(file).toLowerCase();
      const contentType =
        ext === '.m3u8'
          ? 'application/vnd.apple.mpegurl'
          : ext === '.ts'
            ? 'video/MP2T'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : 'application/octet-stream';

      const key = `circlesfera/hls/${params.baseName}/${file}`;

      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ACL: 'public-read',
        },
      });

      await upload.done();
    }

    const masterKey = `circlesfera/hls/${params.baseName}/master.m3u8`;
    const thumbKey = `circlesfera/hls/${params.baseName}/thumb.jpg`;

    const masterPlaylistUrl = this.cdnUrl
      ? `${this.cdnUrl}/${masterKey}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${masterKey}`;

    const thumbnailUrl = this.cdnUrl
      ? `${this.cdnUrl}/${thumbKey}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${thumbKey}`;

    return {
      masterPlaylistUrl,
      thumbnailUrl,
    };
  }
}
