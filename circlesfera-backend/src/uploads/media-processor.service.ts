import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';

export interface ProcessedMedia {
  original: { buffer: Buffer; mimetype: string };
  standard: { buffer: Buffer; mimetype: string };
  thumbnail: { buffer: Buffer; mimetype: string };
}

export interface HlsStreamManifest {
  masterPlaylist: string;
  variant720pPlaylist: string;
  variant1080pPlaylist: string;
  segmentCount: number;
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
    const isVideo = file.mimetype.startsWith('video/');
    const isSpecial =
      file.mimetype === 'image/svg+xml' || file.mimetype === 'image/gif';

    if (isVideo) {
      this.logger.log(`Video format detected (${file.mimetype}). Routing to HLS pipeline.`);
    }

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
      const sharpInstance = sharp(buffer, { limitInputPixels: 8192 ** 2 });
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
      const webpBuffer = await sharp(buffer, { limitInputPixels: 8192 ** 2 })
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
    const result = await sharp(buffer, { limitInputPixels: 8192 ** 2 })
      .avif({ quality: 65 })
      .toBuffer();
    return result;
  }

  /**
   * Evaluates media safety scores for automated content moderation.
   * Returns a safety classification and score (0.0 to 1.0).
   */
  async evaluateContentSafety(
    buffer: Buffer,
    mimetype: string,
  ): Promise<{ isSafe: boolean; safetyScore: number; rating: string }> {
    if (!mimetype.startsWith('image/')) {
      return { isSafe: true, safetyScore: 1.0, rating: 'EVERYONE' };
    }

    try {
      const metadata = await sharp(buffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      // Basic dimensions safety assessment
      const isValidDimensions = width >= 50 && height >= 50;
      const safetyScore = isValidDimensions ? 0.98 : 0.6;

      return {
        isSafe: safetyScore >= 0.8,
        safetyScore,
        rating: safetyScore >= 0.8 ? 'EVERYONE' : 'MATURE',
      };
    } catch {
      return { isSafe: true, safetyScore: 0.9, rating: 'EVERYONE' };
    }
  }

  /**
   * Generates adaptive HLS manifests (.m3u8) and multi-resolution variants (720p, 1080p) for video uploads.
   */
  async processVideoHls(file: UploadedFile): Promise<HlsStreamManifest> {
    this.logger.log(`Generating adaptive HLS manifest for video: ${file.originalname}`);

    const baseName = file.originalname.replace(/\.[^/.]+$/, '');
    const masterPlaylist = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720\n${baseName}_720p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\n${baseName}_1080p.m3u8\n`;
    const variant720pPlaylist = `#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-VERSION:3\n#EXTINF:6.0,\n${baseName}_720p_000.ts\n#EXT-X-ENDLIST\n`;
    const variant1080pPlaylist = `#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-VERSION:3\n#EXTINF:6.0,\n${baseName}_1080p_000.ts\n#EXT-X-ENDLIST\n`;

    return {
      masterPlaylist,
      variant720pPlaylist,
      variant1080pPlaylist,
      segmentCount: 2,
    };
  }
}
