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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  accessTokenCookieOptions,
  clearCookieOptions,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookieOptions,
} from '../common/config/cookie.config.js';
import { AuthService } from './auth.service.js';
import {
  CurrentUser,
  type CurrentUserData,
} from './decorators/current-user.decorator.js';
import {
  LoginDto,
  RegisterDto,
  RequestResetDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/index.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

/** Handles authentication endpoints: register, login, token refresh, logout, email verification, and password reset. */
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  /**
   * Read the refresh token from the http-only cookie.
   * Falls back to the request body for backwards compatibility.
   */
  private getRefreshToken(
    req: Request,
    body?: { refreshToken?: string },
  ): string {
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_TOKEN_COOKIE] || body?.refreshToken || '';
  }

  /** Register a new user and return JWT tokens as HTTP-only cookies. */
  @Post('register')
  @Throttle({
    short: {
      limit: process.env.NODE_ENV !== 'production' ? 1000 : 5,
      ttl: 60000,
    },
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const tokens = await this.authService.register(dto);
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      accessTokenCookieOptions,
    );
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      refreshTokenCookieOptions,
    );
    return { message: 'Registration successful' };
  }

  /** Authenticate with email/username and password. Sets tokens as HTTP-only cookies. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: {
      limit: process.env.NODE_ENV !== 'production' ? 1000 : 5,
      ttl: 60000,
    },
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const tokens = await this.authService.login(dto);
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      accessTokenCookieOptions,
    );
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      refreshTokenCookieOptions,
    );
    return { message: 'Login successful' };
  }

  /** Rotate tokens. Reads refresh token from cookie (or body for backward compat). */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: {
      limit: process.env.NODE_ENV !== 'production' ? 1000 : 5,
      ttl: 60000,
    },
  })
  async refresh(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const refreshToken = this.getRefreshToken(req, body);
    const tokens = await this.authService.refreshToken({ refreshToken });
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      accessTokenCookieOptions,
    );
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      refreshTokenCookieOptions,
    );
    return { message: 'Tokens refreshed' };
  }

  /** Revoke a refresh token and clear auth cookies (requires authentication). */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken = this.getRefreshToken(req, body);
    await this.authService.logout(user.userId, refreshToken);
    res.clearCookie(ACCESS_TOKEN_COOKIE, clearCookieOptions);
    res.clearCookie(REFRESH_TOKEN_COOKIE, clearCookieOptions);
  }

  /** Verify user's email with a one-time token. */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  /** Request a password reset email. */
  @Post('request-reset')
  @HttpCode(HttpStatus.OK)
  async requestReset(@Body() dto: RequestResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  /** Reset password using a valid reset token. */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /** Get all active sessions for the current user. */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@CurrentUser() user: CurrentUserData) {
    return this.authService.getUserSessions(user.userId);
  }

  /** Revoke all other active sessions for the current user. */
  @Delete('sessions/other')
  @UseGuards(JwtAuthGuard)
  async revokeOtherSessions(@CurrentUser() user: CurrentUserData) {
    return this.authService.revokeOtherSessions(user.userId);
  }

  /** Revoke a specific active session by ID. */
  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  async revokeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.authService.revokeSession(user.userId, sessionId);
  }
}
