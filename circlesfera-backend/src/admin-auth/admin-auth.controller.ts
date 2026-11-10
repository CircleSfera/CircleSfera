import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  ADMIN_REFRESH_TOKEN_COOKIE,
  adminAccessTokenCookieOptions,
  adminRefreshTokenCookieOptions,
  clearCookieOptions,
} from '../common/config/cookie.config.js';
import { AdminAuthService } from './admin-auth.service.js';
import {
  AdminChangePasswordDto,
  AdminEnrolDto,
  AdminLoginDto,
  AdminMfaVerifyDto,
  AdminSetUpAccessDto,
  AdminStepUpDto,
} from './dto/admin-auth.dto.js';

@ApiTags('Admin Authentication')
@Controller('admin-auth')
@UseGuards(ThrottlerGuard)
export class AdminAuthController {
  constructor(
    @Inject(AdminAuthService)
    private readonly adminAuthService: AdminAuthService,
  ) {}

  private clientMeta(req: Request) {
    return {
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    };
  }

  private getRefreshToken(req: Request): string {
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[ADMIN_REFRESH_TOKEN_COOKIE] || '';
  }

  private setSessionCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    res.cookie(
      ADMIN_ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      adminAccessTokenCookieOptions,
    );
    res.cookie(
      ADMIN_REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      adminRefreshTokenCookieOptions,
    );
  }

  private clearSessionCookies(res: Response) {
    res.clearCookie(ADMIN_ACCESS_TOKEN_COOKIE, clearCookieOptions);
    res.clearCookie(ADMIN_REFRESH_TOKEN_COOKIE, clearCookieOptions);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @ApiResponse({ status: HttpStatus.OK })
  async login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.adminAuthService.login(
      dto.email,
      dto.password,
      this.clientMeta(req),
    );

    // An external reviewer is signed in at once; their tokens go only into
    // the cookies, never into the answer.
    if (result.status === 'SIGNED_IN') {
      this.setSessionCookies(res, result.tokens);
      return { status: result.status };
    }
    return { status: result.status, mfaToken: result.mfaToken };
  }

  // Enrols an authenticator with the proof beyond the password; answers the
  // new secret, this once, to be confirmed at mfa/verify.
  @Post('enrol')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiResponse({ status: HttpStatus.OK })
  async enrol(@Body() dto: AdminEnrolDto, @Req() req: Request) {
    return this.adminAuthService.enrol(
      dto.mfaToken,
      dto.proof,
      this.clientMeta(req),
    );
  }

  // Sets up the access from the link or a code, with a password of its own.
  // A member of staff gets a new authenticator to confirm at mfa/verify; an
  // external reviewer is signed in, the tokens only in the cookies.
  @Post('access')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiResponse({ status: HttpStatus.OK })
  async setUpAccess(
    @Body() dto: AdminSetUpAccessDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.adminAuthService.setUpAccess(
      dto.email,
      dto.proof,
      dto.password,
      this.clientMeta(req),
    );
    if (result.status === 'SIGNED_IN') {
      this.setSessionCookies(res, result.tokens);
      return { status: result.status };
    }
    return result;
  }

  // Changes the password of the identity signed in; this session stays.
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiResponse({ status: HttpStatus.OK })
  async changePassword(
    @CurrentAdmin() admin: CurrentAdminData,
    @Body() dto: AdminChangePasswordDto,
    @Req() req: Request,
  ) {
    await this.adminAuthService.changePassword(admin.adminId, dto, {
      ...this.clientMeta(req),
      keepRefreshToken: this.getRefreshToken(req) || undefined,
    });
    return { status: 'OK' };
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 } })
  @ApiResponse({ status: HttpStatus.OK })
  async verifyMfa(
    @Body() dto: AdminMfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.adminAuthService.verifyMfa(
      dto.mfaToken,
      dto.code,
      this.clientMeta(req),
    );
    this.setSessionCookies(res, tokens);
    return { message: 'Login successful', status: 'OK' };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 60, ttl: 60000 } })
  @ApiResponse({ status: HttpStatus.OK })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.adminAuthService.refresh(
      this.getRefreshToken(req),
      this.clientMeta(req),
    );
    this.setSessionCookies(res, tokens);
    return { message: 'Token refreshed' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard)
  @ApiResponse({ status: HttpStatus.OK })
  async logout(
    @CurrentAdmin() admin: CurrentAdminData,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.adminAuthService.logout(
      admin.adminId,
      this.getRefreshToken(req),
      this.clientMeta(req),
    );
    this.clearSessionCookies(res);
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  @ApiResponse({ status: 200 })
  async me(@CurrentAdmin() admin: CurrentAdminData) {
    return this.adminAuthService.me(admin.adminId);
  }

  @Get('sessions')
  @UseGuards(AdminJwtAuthGuard)
  @ApiResponse({ status: 200 })
  async sessions(@CurrentAdmin() admin: CurrentAdminData) {
    return this.adminAuthService.listSessions(admin.adminId);
  }

  @Delete('sessions/:id')
  @UseGuards(AdminJwtAuthGuard)
  @ApiResponse({ status: 200 })
  async revokeSession(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id') id: string,
  ) {
    await this.adminAuthService.revokeSession(admin.adminId, id);
    return { message: 'Session revoked' };
  }

  @Post('step-up')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard)
  @ApiResponse({ status: HttpStatus.OK })
  async stepUp(
    @CurrentAdmin() admin: CurrentAdminData,
    @Body() dto: AdminStepUpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken } = await this.adminAuthService.stepUp(
      admin.adminId,
      dto,
    );
    res.cookie(
      ADMIN_ACCESS_TOKEN_COOKIE,
      accessToken,
      adminAccessTokenCookieOptions,
    );
    return { message: 'Step-up verified' };
  }
}
