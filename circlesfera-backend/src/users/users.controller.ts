import { SUGGESTIONS_MAX, SUGGESTIONS_SHORT } from '@circlesfera/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Optional,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { parseAllowedOrigins } from '../common/config/origin.config.js';
import { DataExportService } from './data-export.service.js';
import { UpdateLocaleDto } from './dto/update-locale.dto.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { UsersService } from './users.service.js';

// REST controller for user management and follow suggestions.
@Controller('users')
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(DataExportService)
    private readonly dataExportService: DataExportService,
    @Optional()
    @Inject(ConfigService)
    private readonly configService?: ConfigService,
  ) {}

  // Get suggested users to follow based on popularity.
  @ApiQuery({ name: 'limit', required: false })
  @Get('suggestions')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, type: [Object] })
  async getSuggestions(
    @CurrentUser() user: CurrentUserData,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>[]> {
    // As many as asked for, from one up to SUGGESTIONS_MAX.
    const asked = Number.parseInt(limit ?? '', 10);
    const count = Number.isFinite(asked)
      ? Math.min(Math.max(asked, 1), SUGGESTIONS_MAX)
      : SUGGESTIONS_SHORT;
    return this.usersService.getSuggestions(user.userId, count);
  }

  // Staff ban and unban a user only through the Admin Panel's
  // PATCH admin/users/:id/ban and :id/unban (AdminUsersService), which also
  // open the appeal window, write the audit log, drop the cached profile and
  // tell the person by email.

  // GDPR: Request Data Export (.zip).
  @Get('gdpr/export')
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 2, ttl: 3600000 } })
  @ApiResponse({ status: 200 })
  async requestDataExport(@CurrentUser() user: CurrentUserData) {
    return this.dataExportService.requestDataExport(user.userId);
  }

  // GDPR: Get Data Export History.
  @Get('gdpr/exports')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  async getExportHistory(@CurrentUser() user: CurrentUserData) {
    return this.dataExportService.getExportHistory(user.userId);
  }

  // GDPR: Download Data Export archive (.zip)
  @ApiQuery({ name: 'token', required: false })
  @Get('gdpr/exports/:id/download')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
  async downloadDataExport(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @CurrentUser() user: CurrentUserData | null | undefined,
    @Res() res: Response,
  ) {
    await this.dataExportService.streamDataExport(id, user?.userId, token, res);
  }

  // Kept for existing clients: self-service deletion is always the scheduled
  // 30-day flow with full cleanup, never an immediate hard delete.
  @Delete('gdpr/account')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  async deleteAccount(@CurrentUser() user: CurrentUserData) {
    return this.deleteMe(user);
  }

  // DELETE /users/me: Scheduled account deletion (GDPR, 30-day grace).
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  async deleteMe(@CurrentUser() user: CurrentUserData) {
    const scheduledDeletionAt = await this.usersService.scheduleDeletion(
      user.userId,
    );
    return {
      success: true,
      message: 'Account scheduled for deletion',
      scheduled_deletion_at: scheduledDeletionAt.toISOString(),
    };
  }

  // POST /users/me/restore: Cancel scheduled deletion within the grace window.
  @Post('me/restore')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 201 })
  async restoreMe(@CurrentUser() user: CurrentUserData) {
    return this.usersService.cancelScheduledDeletion(user.userId);
  }

  // Get user settings.
  @Get('me/settings')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  async getSettings(@CurrentUser() user: CurrentUserData) {
    return this.usersService.getSettings(user.userId, user.profileId);
  }

  // Update user settings.
  @Put('me/settings')
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  @ApiResponse({ status: 200 })
  async updateSettings(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.usersService.updateSettings(user.userId, user.profileId, dto);
  }

  // Language of the account's emails and notices. Not behind the
  // verified-email gate: the verification email itself must use it.
  @Put('me/locale')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  async updateLocale(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateLocaleDto,
  ) {
    return this.usersService.updateLocale(user.userId, dto.locale);
  }

  // Identity Verification

  @Post('identity-session')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 201 })
  async createIdentitySession(
    @CurrentUser() user: CurrentUserData,
    @Body() body: { returnUrl?: string },
  ): Promise<{ url: string }> {
    const frontendUrl =
      this.configService?.get<string>('FRONTEND_URL') ||
      'http://localhost:5173';
    return this.usersService.createIdentitySession(
      user.userId,
      this.ownReturnUrl(body?.returnUrl) ?? `${frontendUrl}/accounts/account`,
    );
  }

  // The provider sends the person back only to one of the web app's own
  // origins (FRONTEND_URL, or an origin listed in CORS_ORIGIN); any other
  // address is replaced by the account page. The native apps' addresses
  // have no web origin, so they get the account page too (the provider's
  // page opens in the system browser there anyway).
  private ownReturnUrl(returnUrl: unknown): string | undefined {
    if (typeof returnUrl !== 'string' || returnUrl.length > 2048) {
      return undefined;
    }
    let origin: string;
    try {
      origin = new URL(returnUrl).origin;
    } catch {
      return undefined;
    }
    // A scheme with no web origin (capacitor:, javascript:, data:) is "null".
    if (origin === 'null') return undefined;
    const frontendUrl = this.configService?.get<string>('FRONTEND_URL');
    const own = new Set(
      parseAllowedOrigins(
        this.configService?.get<string>('CORS_ORIGIN'),
        false,
      ),
    );
    if (URL.canParse(frontendUrl ?? '')) {
      own.add(new URL(frontendUrl as string).origin);
    }
    return own.has(origin) ? returnUrl : undefined;
  }

  @Post('identity-session/sync')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 201 })
  async syncIdentitySession(
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ status: string }> {
    return this.usersService.syncIdentitySession(user.userId);
  }
}
