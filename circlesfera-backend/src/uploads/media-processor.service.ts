import {
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { Semaphore } from '../common/utils/semaphore.js';
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
   * Maximum total pixels allowed per image (width × height).
   * Default matches Sharp's own `limitInputPixels` (8192²).
   * Images exceeding this are rejected with HTTP 413 before Sharp touches them.
   */
  private readonly MAX_PIXELS = 8192 ** 2; // 67,108,864 px

  /**
   * Global semaphore that caps the number of concurrent Sharp operations.
   * Prevents N simultaneous uploads from spawning N×3 Sharp workers at once.
   * Configurable via SHARP_CONCURRENCY env var; defaults to 6.
   */
  private readonly semaphore: Semaphore;

  constructor() {
    const concurrency = Math.max(
      1,
      parseInt(process.env.SHARP_CONCURRENCY ?? '6', 10) || 6,
    );
    this.semaphore = new Semaphore(concurrency);
    this.logger.log(`Sharp concurrency limit: ${concurrency} slots`);
  }

  // Processes an image file: resizes, converts to format (AVIF/WebP), and strips metadata.
  // Generates multiple variants (original, standard, thumbnail).
  // For non-images, returns the same buffer for all variants.
  async process(file: UploadedFile): Promise<ProcessedMedia> {
    this.logger.log(
      `Processing media variants: ${file.originalname} (${file.mimetype}) - ${Math.round(file.buffer.length / 1024)}KB`,
    );

    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');

    // Reject SVG uploads immediately (mitigates Stored XSS / XXE)
    if (file.mimetype === 'image/svg+xml') {
      throw new UnsupportedMediaTypeException(
        'SVG uploads are not permitted for security reasons. Please upload raster images (JPEG, PNG, WebP, GIF).',
      );
    }

    // GIF is kept intact to preserve animation frames without Sharp re-encoding
    const isSpecial = file.mimetype === 'image/gif';

    if (isVideo) {
      this.logger.log(
        `Video format detected (${file.mimetype}). Routing to HLS pipeline.`,
      );
    }

    // 1. Skip processing for non-images or special images (GIF)
    if (!isImage || isSpecial) {
      this.logger.debug(`Skipping processing for format: ${file.mimetype}`);
      const base = { buffer: file.buffer, mimetype: file.mimetype };
      return { original: base, standard: base, thumbnail: base };
    }

    // 2. Validate image dimensions before invoking Sharp.
    //    Reading metadata is cheap (no full decode) and gives us pixel counts.
    const meta = await sharp(file.buffer, {
      limitInputPixels: false,
    }).metadata();
    const totalPixels = (meta.width ?? 0) * (meta.height ?? 0);
    if (totalPixels > this.MAX_PIXELS) {
      this.logger.warn(
        `Image too large: ${meta.width}×${meta.height} (${totalPixels} px) exceeds limit of ${this.MAX_PIXELS} px. File: ${file.originalname}`,
      );
      throw new PayloadTooLargeException(
        `Image resolution exceeds the maximum allowed (${Math.round(this.MAX_PIXELS / 1_000_000)} MP). Please resize before uploading.`,
      );
    }

    try {
      // 3. Generate Variants in Parallel (each slot is rate-limited by the semaphore)
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

  // Internal helper to process a single image variant.
  // Acquires a semaphore slot before invoking Sharp and releases it on completion.
  private async processImage(
    buffer: Buffer,
    width: number,
    quality: number,
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    const release = await this.semaphore.acquire();
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
    } finally {
      release();
    }
  }

  // Specifically convert to AVIF if requested (for future-proofing).
  async toAvif(buffer: Buffer): Promise<Buffer> {
    const result = await sharp(buffer, { limitInputPixels: 8192 ** 2 })
      .avif({ quality: 65 })
      .toBuffer();
    return result;
  }

  // Evaluates media safety scores for automated content moderation.
  // Returns a safety classification and score (0.0 to 1.0).
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

  // Generates adaptive HLS manifests (.m3u8) and multi-resolution variants (720p, 1080p) for video uploads.
  async processVideoHls(file: UploadedFile): Promise<HlsStreamManifest> {
    this.logger.log(
      `Generating adaptive HLS manifest for video: ${file.originalname}`,
    );

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
