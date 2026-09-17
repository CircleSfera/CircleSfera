import {
  Injectable,
  Logger,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';

/**
 * Allowlist of MIME types that CircleSfera accepts for upload.
 *
 * Each entry is the canonical MIME type as returned by `file-type`
 * when reading the real magic bytes of the buffer.
 *
 * Rationale for exclusions:
 * - SVG is XML text — has no binary magic bytes and is handled separately.
 * - HEIC/HEIF: `file-type` returns `image/heic` or `image/heif`; both listed.
 */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg', // MP3
  'audio/wav',
  'audio/x-m4a',
]);

/**
 * Validates that the real binary content of an uploaded file matches:
 *   1. A known, safe media type (magic bytes allowlist).
 *   2. The MIME type declared by the client (`Content-Type` / multer).
 *
 * SVG files are validated by content inspection (must start with `<svg` or
 * `<?xml`) because they carry no binary signature.
 *
 * Throws `UnsupportedMediaTypeException` (HTTP 415) on any mismatch.
 */
@Injectable()
export class MediaSignatureValidator {
  private readonly logger = new Logger(MediaSignatureValidator.name);

  async validate(buffer: Buffer, declaredMimetype: string): Promise<void> {
    // --- SVG Security Policy ---
    // User-uploaded SVGs are prohibited to prevent Stored XSS, XML external entity
    // attacks (XXE), and script execution in user browsers.
    if (declaredMimetype === 'image/svg+xml') {
      this.logger.warn(
        'Upload rejected: SVG uploads are prohibited under platform security policy (mitigates Stored XSS / XXE).',
      );
      throw new UnsupportedMediaTypeException(
        'SVG uploads are not permitted for security reasons. Please upload raster images (JPEG, PNG, WebP, GIF).',
      );
    }

    // Proactively scan text/polyglot payloads for disguised active SVG content
    this.assertNoActiveSvgContent(buffer);

    // --- Binary magic-byte detection ---
    const detected = await fileTypeFromBuffer(buffer);

    if (!detected) {
      this.logger.warn(
        `Signature validation failed: no magic bytes detected for declared type "${declaredMimetype}"`,
      );
      throw new UnsupportedMediaTypeException(
        'File content could not be identified. Only image, video and audio files are accepted.',
      );
    }

    // 1. Real type must be in the allowlist.
    if (!ALLOWED_MIME_TYPES.has(detected.mime)) {
      this.logger.warn(
        `Signature validation failed: detected type "${detected.mime}" is not allowed.`,
      );
      throw new UnsupportedMediaTypeException(
        `File type "${detected.mime}" is not permitted.`,
      );
    }

    // 2. Real type must match what the client declared.
    //    We normalise to handle minor variations (e.g. "video/mp4" vs "video/mpeg").
    if (!this.mimesAreCompatible(detected.mime, declaredMimetype)) {
      this.logger.warn(
        `Signature mismatch: declared "${declaredMimetype}" but detected "${detected.mime}".`,
      );
      throw new UnsupportedMediaTypeException(
        `Declared MIME type does not match actual file content.`,
      );
    }

    this.logger.debug(
      `Signature OK: declared="${declaredMimetype}" detected="${detected.mime}"`,
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Scans a text or polyglot buffer to ensure no active SVG, XML entities, or
   * script payloads reach the storage or delivery layer.
   */
  private assertNoActiveSvgContent(buffer: Buffer): void {
    // Only inspect the first 4KB for efficiency and to catch headers/scripts
    const sample = buffer.subarray(0, 4096).toString('utf8').toLowerCase();

    // Check for SVG or XML markers
    const hasSvgOrXml =
      sample.includes('<svg') ||
      sample.includes('<?xml') ||
      sample.includes('xmlns="http://www.w3.org/2000/svg"') ||
      sample.includes("xmlns='http://www.w3.org/2000/svg'");

    if (hasSvgOrXml) {
      // Check for active script/XSS/XXE vectors
      const containsActivePayload =
        sample.includes('<script') ||
        sample.includes('<!entity') ||
        sample.includes('<!doctype') ||
        sample.includes('<foreignobject') ||
        sample.includes('javascript:') ||
        sample.includes('data:text/html') ||
        /on\w+\s*=/i.test(sample) || // event handlers: onload=, onerror=, etc.
        /<use\s+[^>]*href/i.test(sample);

      if (containsActivePayload) {
        this.logger.warn(
          'Upload rejected: active SVG/XML script or entity content detected in buffer.',
        );
        throw new UnsupportedMediaTypeException(
          'File contains prohibited active XML/SVG content or scripts.',
        );
      }
    }
  }

  /**
   * Returns true when the detected MIME and declared MIME are compatible.
   *
   * "Compatible" means either exactly equal or one of the known aliasing pairs
   * that browsers / multer commonly produce (e.g. `audio/mp3` ↔ `audio/mpeg`).
   */
  private mimesAreCompatible(detected: string, declared: string): boolean {
    if (detected === declared) return true;

    const aliases: Record<string, string[]> = {
      'audio/mpeg': ['audio/mp3', 'audio/mpeg3'],
      'audio/wav': ['audio/wave', 'audio/x-wav'],
      'audio/x-m4a': ['audio/m4a', 'audio/mp4'],
      'video/quicktime': ['video/mov'],
      'image/jpeg': ['image/jpg'],
    };

    return aliases[detected]?.includes(declared) ?? false;
  }
}
