import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';

export interface ProcessedMedia {
  original: { buffer: Buffer; mimetype: string };
  standard: { buffer: Buffer; mimetype: string };
  thumbnail: { buffer: Buffer; mimetype: string };
}

@Injectable()
export class MediaProcessorService {
  private readonly logger = new Logger(MediaProcessorService.name);
  private readonly MAX_WIDTH_ORIGINAL = 1920;
  private readonly MAX_WIDTH_STANDARD = 1080;
  private readonly MAX_WIDTH_THUMBNAIL = 300;
  private readonly DEFAULT_QUALITY = 82;

  /**
   * Processes an image file: resizes, converts to format (AVIF/WebP), and strips metadata.
   * Generates multiple variants (original, standard, thumbnail).
   * For non-images, returns the same buffer for all variants.
   */
  async process(file: UploadedFile): Promise<ProcessedMedia> {
    this.logger.log(
      `Processing media variants: ${file.originalname} (${file.mimetype}) - ${Math.round(file.buffer.length / 1024)}KB`,
    );

    const isImage = file.mimetype.startsWith('image/');
    const isSpecial =
      file.mimetype === 'image/svg+xml' || file.mimetype === 'image/gif';

    // 1. Skip processing for non-images or special images (SVG/GIF)
    if (!isImage || isSpecial) {
      this.logger.debug(`Skipping processing for format: ${file.mimetype}`);
      const base = { buffer: file.buffer, mimetype: file.mimetype };
      return { original: base, standard: base, thumbnail: base };
    }

    try {
      // 2. Generate Variants in Parallel
      const [original, standard, thumbnail] = await Promise.all([
        this.processImage(file.buffer, this.MAX_WIDTH_ORIGINAL, 75),
        this.processImage(
          file.buffer,
          this.MAX_WIDTH_STANDARD,
          this.DEFAULT_QUALITY,
        ),
        this.processImage(file.buffer, this.MAX_WIDTH_THUMBNAIL, 70),
      ]);

      return { original, standard, thumbnail };
    } catch (error: unknown) {
      this.logger.error(
        `Multi-variant processing failed for ${file.originalname}: ${
          error instanceof Error ? error.message : String(error)
        }. Falling back to original.`,
      );
      const base = { buffer: file.buffer, mimetype: file.mimetype };
      return { original: base, standard: base, thumbnail: base };
    }
  }

  /**
   * Internal helper to process a single image variant
   */
  private async processImage(
    buffer: Buffer,
    width: number,
    quality: number,
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    try {
      const sharpInstance = sharp(buffer);
      const processor = sharpInstance
        .resize({ width, withoutEnlargement: true, fit: 'inside' })
        .rotate(); // Handle EXIF orientation

      // Prefer AVIF for superior efficiency
      const processedBuffer = await processor
        .avif({ quality: Math.max(quality - 10, 45), effort: 3 })
        .toBuffer();

      return { buffer: processedBuffer, mimetype: 'image/avif' };
    } catch {
      // Fallback to WebP
      const webpBuffer = await sharp(buffer)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();

      return { buffer: webpBuffer, mimetype: 'image/webp' };
    }
  }

  /**
   * Specifically convert to AVIF if requested (for future-proofing).
   */
  async toAvif(buffer: Buffer): Promise<Buffer> {
    const result = await sharp(buffer).avif({ quality: 65 }).toBuffer();
    return result;
  }
}
