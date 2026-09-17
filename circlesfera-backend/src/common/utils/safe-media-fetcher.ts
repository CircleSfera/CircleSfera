import * as dns from 'node:dns';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import {
  Logger,
  PayloadTooLargeException,
  RequestTimeoutException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import {
  isPrivateIp,
  SsrfBlockedError,
  ValidateUrlOptions,
  validateTargetUrl,
} from './ssrf.util.js';

const logger = new Logger('SafeMediaFetcher');

/**
 * Default maximum size: 25 MB (aligned with OpenAI Whisper audio limit).
 */
export const DEFAULT_MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/**
 * Default network timeout: 15 seconds.
 */
export const DEFAULT_MEDIA_TIMEOUT_MS = 15_000;

/**
 * Default maximum redirects to follow safely.
 */
export const DEFAULT_MAX_REDIRECTS = 3;

/**
 * Standard allowlist of media MIME types accepted for AI processing / transcription.
 */
export const DEFAULT_ALLOWED_AI_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
  'audio/mp4',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/ogg',
  'audio/flac',
];

export interface SafeFetchOptions extends ValidateUrlOptions {
  /** Maximum allowed response size in bytes (default: 25MB) */
  maxBytes?: number;
  /** Timeout in milliseconds for the complete transfer (default: 15s) */
  timeoutMs?: number;
  /** Maximum number of HTTP redirects to follow (default: 3) */
  maxRedirects?: number;
  /** List of permitted MIME types validated via magic bytes */
  allowedMimeTypes?: string[];
}

export interface FetchedMediaResult {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

/**
 * Safely fetches a media file from a local `/uploads/` path or remote HTTP(S) URL.
 *
 * Guarantees:
 * 1. Anti-SSRF: Private, loopback, and cloud metadata targets are rejected.
 * 2. Anti-DNS-Rebinding: Target IP validated during socket lookup & connect.
 * 3. Safe Redirects: Redirects are bounded and each target re-validated.
 * 4. Bounded Size: Stream and Content-Length enforcement aborts oversized payloads.
 * 5. Bounded Time: Strict timeouts prevent hung connections (slowloris).
 * 6. Magic Bytes Validation: Real binary signature inspected via `file-type`.
 */
export async function safeFetchMedia(
  mediaUrl: string,
  options: SafeFetchOptions = {},
): Promise<FetchedMediaResult> {
  const {
    maxBytes = DEFAULT_MAX_MEDIA_BYTES,
    timeoutMs = DEFAULT_MEDIA_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    allowedMimeTypes = DEFAULT_ALLOWED_AI_MIME_TYPES,
  } = options;

  // ─── 1. Local filesystem fast-path (/uploads/...) ──────────────────────────
  if (mediaUrl.startsWith('/uploads/') || mediaUrl.startsWith('uploads/')) {
    return fetchLocalUpload(mediaUrl, maxBytes, allowedMimeTypes);
  }

  // ─── 2. Remote HTTP/HTTPS fetch with SSRF & resource bounds ────────────────
  let currentUrl = mediaUrl;
  let redirectsRemaining = maxRedirects;

  while (true) {
    const validatedUrl = await validateTargetUrl(currentUrl, options);

    const result = await fetchHttpMedia(
      validatedUrl,
      maxBytes,
      timeoutMs,
      options.dnsLookup,
    );

    if (result.isRedirect) {
      if (redirectsRemaining <= 0) {
        throw new Error(
          `Too many redirects while fetching media (maximum ${maxRedirects} allowed).`,
        );
      }
      redirectsRemaining--;
      currentUrl = new URL(result.location, currentUrl).toString();
      logger.debug(
        `Following redirect (${maxRedirects - redirectsRemaining}/${maxRedirects}) to: ${currentUrl}`,
      );
      continue;
    }

    // ─── 3. Magic-byte signature verification ─────────────────
    const detected = await fileTypeFromBuffer(result.buffer);

    if (allowedMimeTypes && allowedMimeTypes.length > 0) {
      if (!detected || !allowedMimeTypes.includes(detected.mime)) {
        logger.warn(
          `Media signature validation failed: detected="${detected?.mime ?? 'unknown'}" for URL ${currentUrl}`,
        );
        throw new UnsupportedMediaTypeException(
          `File content is not an accepted media type (detected "${detected?.mime ?? 'unknown'}"). ` +
            `Permitted types: ${allowedMimeTypes.join(', ')}`,
        );
      }
    }

    return {
      buffer: result.buffer,
      contentType: detected?.mime ?? 'application/octet-stream',
      ext: detected?.ext ?? 'bin',
    };
  }
}

/**
 * Reads and validates a local file in the `uploads/` directory,
 * guaranteeing no path traversal outside `uploads/`.
 */
async function fetchLocalUpload(
  mediaUrl: string,
  maxBytes: number,
  allowedMimeTypes: string[],
): Promise<FetchedMediaResult> {
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const relativePath = mediaUrl.replace(/^\/+/, '');
  const resolvedPath = path.resolve(process.cwd(), relativePath);

  if (!resolvedPath.startsWith(uploadsRoot)) {
    throw new SsrfBlockedError(
      `Path traversal attempt detected in media URL: "${mediaUrl}"`,
      'PATH_TRAVERSAL',
    );
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Local media file not found: "${mediaUrl}"`);
  }

  const stat = await fs.promises.stat(resolvedPath);
  if (stat.size > maxBytes) {
    throw new PayloadTooLargeException(
      `Local media file size (${stat.size} bytes) exceeds limit (${maxBytes} bytes).`,
    );
  }

  const buffer = await fs.promises.readFile(resolvedPath);
  const detected = await fileTypeFromBuffer(buffer);

  if (allowedMimeTypes && allowedMimeTypes.length > 0) {
    if (!detected || !allowedMimeTypes.includes(detected.mime)) {
      throw new UnsupportedMediaTypeException(
        `File type "${detected?.mime ?? 'unknown'}" is not permitted.`,
      );
    }
  }

  return {
    buffer,
    contentType: detected?.mime ?? 'application/octet-stream',
    ext: detected?.ext ?? 'bin',
  };
}

interface HttpFetchResponse {
  isRedirect: boolean;
  location: string;
  buffer: Buffer;
}

/**
 * Performs a single HTTP or HTTPS request with:
 * - Anti-DNS-Rebinding lookup hook
 * - Socket connection remoteAddress inspection
 * - Strict timeout timer
 * - Chunk-by-chunk body size counter
 */
function fetchHttpMedia(
  url: URL,
  maxBytes: number,
  timeoutMs: number,
  customDnsLookup?: typeof dns.promises.lookup,
): Promise<HttpFetchResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    let timer: NodeJS.Timeout | null = null;
    let destroyed = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const fail = (err: Error) => {
      if (destroyed) return;
      destroyed = true;
      cleanup();
      req.destroy();
      reject(err);
    };

    const requestOptions: https.RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? Number.parseInt(url.port, 10) : isHttps ? 443 : 80,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'CircleSfera-MediaFetcher/1.0',
        Accept: '*/*',
      },
      // Socket-level DNS lookup check (Anti-DNS-Rebinding)
      lookup: (hostname, _options, callback) => {
        if (customDnsLookup) {
          customDnsLookup(hostname, { all: true })
            .then((records) => {
              for (const r of records) {
                if (isPrivateIp(r.address)) {
                  return callback(
                    new SsrfBlockedError(
                      `SSRF blocked: Hostname resolved to private IP "${r.address}" during connection.`,
                      'PRIVATE_IP_RESOLVED',
                    ) as any,
                    '',
                    4,
                  );
                }
              }
              const first = records[0];
              callback(null, first.address, first.family);
            })
            .catch((err) => callback(err as any, '', 4));
        } else {
          dns.lookup(hostname, { all: true }, (err, addresses) => {
            if (err) return callback(err as any, '', 4);
            for (const addr of addresses) {
              if (isPrivateIp(addr.address)) {
                return callback(
                  new SsrfBlockedError(
                    `SSRF blocked: Hostname resolved to private IP "${addr.address}" during connection.`,
                    'PRIVATE_IP_RESOLVED',
                  ) as any,
                  '',
                  4,
                );
              }
            }
            callback(null, addresses[0].address, addresses[0].family);
          });
        }
      },
    };

    const req = client.request(requestOptions, (res) => {
      // 1. Handle HTTP Redirects
      const statusCode = res.statusCode ?? 500;
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        cleanup();
        const location = res.headers.location;
        if (!location) {
          return fail(
            new Error(`HTTP ${statusCode} redirect without Location header.`),
          );
        }
        res.resume(); // Discard redirect body
        return resolve({ isRedirect: true, location, buffer: Buffer.alloc(0) });
      }

      // 2. Validate HTTP Status Code
      if (statusCode !== 200) {
        return fail(
          new Error(
            `Failed to fetch media from remote host: HTTP ${statusCode}`,
          ),
        );
      }

      // 3. Early check on Content-Length header
      const clHeader = res.headers['content-length'];
      if (clHeader) {
        const declaredLength = Number.parseInt(clHeader, 10);
        if (!Number.isNaN(declaredLength) && declaredLength > maxBytes) {
          return fail(
            new PayloadTooLargeException(
              `Media payload (${declaredLength} bytes) exceeds maximum limit (${maxBytes} bytes).`,
            ),
          );
        }
      }

      // 4. Bounded body streaming
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          res.destroy();
          return fail(
            new PayloadTooLargeException(
              `Media download exceeded maximum size limit of ${maxBytes} bytes.`,
            ),
          );
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        cleanup();
        if (destroyed) return;
        resolve({
          isRedirect: false,
          location: '',
          buffer: Buffer.concat(chunks, totalBytes),
        });
      });

      res.on('error', fail);
    });

    // 5. Remote address inspection on socket connection
    req.on('socket', (socket) => {
      socket.on('connect', () => {
        if (socket.remoteAddress && isPrivateIp(socket.remoteAddress)) {
          fail(
            new SsrfBlockedError(
              `SSRF blocked: Connected socket remote address "${socket.remoteAddress}" is private.`,
              'PRIVATE_IP_CONNECTED',
            ),
          );
        }
      });
    });

    // 6. Network timeout handling
    timer = setTimeout(() => {
      fail(
        new RequestTimeoutException(
          `Media fetch timed out after ${timeoutMs}ms.`,
        ),
      );
    }, timeoutMs);

    req.on('error', fail);
    req.end();
  });
}
