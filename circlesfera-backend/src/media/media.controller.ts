import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { MediaAuthService } from './media-auth.service.js';
import { MediaStaffViewerService } from './media-staff-viewer.service.js';

@ApiTags('Media')
@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(
    private readonly mediaAuthService: MediaAuthService,
    private readonly staffViewer: MediaStaffViewerService,
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
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async authCheck(
    @Req()
    req: Request & { user?: { userId?: string; profileId?: string } },
    @Res({ passthrough: true }) _res: Response,
  ): Promise<void> {
    const originalUri =
      (req.headers['x-original-uri'] as string | undefined) ?? '';

    const viewerUserId = req.user?.userId ?? null;
    const viewerProfileId = req.user?.profileId ?? null;

    // Staff are recognised only when a file of removed content is asked for.
    const allowed = await this.mediaAuthService.isAccessAllowed(
      originalUri,
      viewerUserId,
      viewerProfileId,
      () => this.staffViewer.isContentStaff(req),
    );

    if (!allowed) {
      this.logger.debug(
        `auth-check denied — uri=${originalUri} user=${viewerUserId ?? 'anonymous'}`,
      );
      throw new ForbiddenException();
    }
  }
}
