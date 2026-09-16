import { ErrorCode } from '@circlesfera/shared';
import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../uploads/interfaces/storage-provider.interface.js';
import { MediaAuthService } from './media-auth.service.js';

@ApiTags('Media')
@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaAuthService: MediaAuthService,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  /**
   * Internal endpoint called by Nginx `auth_request /internal/media-auth`.
   *
   * Nginx passes the original request URI via the `X-Original-URI` header.
   * This endpoint returns:
   *   - 204 No Content  → Nginx serves the file.
   *   - 403 Forbidden   → Nginx returns 403 to the client.
   *
   * The JwtOptionalGuard never throws; it simply leaves `req.user` as null
   * for anonymous visitors so they can still reach public content.
   */
  @ApiExcludeEndpoint()
  @UseGuards(JwtOptionalGuard)
  @Get('auth-check')
  @HttpCode(HttpStatus.NO_CONTENT)
  async authCheck(
    @Req()
    req: Request & { user?: { userId?: string; profileId?: string } },
    @Res({ passthrough: true }) _res: Response,
  ): Promise<void> {
    const originalUri =
      (req.headers['x-original-uri'] as string | undefined) ?? '';

    const viewerUserId = req.user?.userId ?? null;
    const viewerProfileId = req.user?.profileId ?? null;

    const allowed = await this.mediaAuthService.isAccessAllowed(
      originalUri,
      viewerUserId,
      viewerProfileId,
    );

    if (!allowed) {
      this.logger.debug(
        `auth-check denied — uri=${originalUri} user=${viewerUserId ?? 'anonymous'}`,
      );
      throw new ForbiddenException();
    }
  }

  @Get('teaser/:mediaId/*file')
  async serveTeaser(
    @Param('mediaId') mediaId: string,
    @Param('file') file: string | string[],
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const media = await this.prisma.postMedia.findUnique({
      where: { id: mediaId },
    });

    if (!media?.standardUrl) {
      this.logger.warn(
        `Teaser requested for missing media: ${mediaId} by ${req.ip}`,
      );
      throw AppException.NotFound(ErrorCode.MEDIA_NOT_FOUND, 'Media not found');
    }

    // Resolve the base folder from standardUrl.
    // Supports both local paths (/uploads/<baseName>/...) and
    // remote URLs (https://.../.../circlesfera/hls/<baseName>/...).
    const localMatch = media.standardUrl.match(/^\/uploads\/(.+)\/[^/]+$/);
    const remoteMatch = media.standardUrl.match(
      /circlesfera\/hls\/([^/]+)\/[^/]+$/,
    );
    const baseFolder = (localMatch ?? remoteMatch)?.[1] ?? null;

    if (!baseFolder) {
      this.logger.error(
        `Invalid media path format for media ${mediaId}: ${media.standardUrl}`,
      );
      throw AppException.NotFound(
        ErrorCode.INVALID_MEDIA_PATH,
        'Invalid media path',
      );
    }

    // Build the relative path from the wildcard parameter
    const relativeFile = Array.isArray(file) ? file.join('/') : file;

    // Reject obvious path traversal at the param level (before storage call)
    if (relativeFile.includes('..') || relativeFile.startsWith('/')) {
      this.logger.warn(
        `Path traversal blocked for media ${mediaId}: ${relativeFile}`,
      );
      throw AppException.Forbidden(
        ErrorCode.INVALID_MEDIA_PATH,
        'Invalid file path',
      );
    }

    // If it's a TS segment, only allow the first two segments (free preview window)
    if (relativeFile.endsWith('.ts')) {
      const segmentMatch = relativeFile.match(/_(\d+)\.ts$/);
      if (segmentMatch) {
        const segmentIndex = parseInt(segmentMatch[1], 10);
        if (segmentIndex >= 2) {
          throw AppException.Forbidden(
            ErrorCode.PREMIUM_CONTENT_LOCKED,
            'Premium content locked',
          );
        }
      }
    }

    // Retrieve artifact through the storage provider abstraction
    const artifact = await this.storageProvider.getMediaArtifact?.({
      baseFolder,
      relativePath: relativeFile,
    });

    if (!artifact) {
      throw AppException.NotFound(ErrorCode.MEDIA_NOT_FOUND, 'File not found');
    }

    // If it's a playlist (.m3u8), slice to first 2 segments (teaser preview)
    if (relativeFile.endsWith('.m3u8')) {
      const content = artifact.content.toString('utf8');
      const lines = content.split('\n');

      const processedLines: string[] = [];
      let segmentCount = 0;
      const MAX_SEGMENTS = 2; // Roughly 4–5 seconds depending on HLS segment target duration

      for (const line of lines) {
        if (line.startsWith('#EXTINF:')) {
          if (segmentCount >= MAX_SEGMENTS) break;
          segmentCount++;
        }
        processedLines.push(line);
      }

      // Add ENDLIST if we cut it early
      if (
        segmentCount >= MAX_SEGMENTS &&
        !processedLines.includes('#EXT-X-ENDLIST')
      ) {
        processedLines.push('#EXT-X-ENDLIST');
      }

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(processedLines.join('\n'));
    }

    res.setHeader('Content-Type', artifact.contentType);
    return res.send(artifact.content);
  }
}
