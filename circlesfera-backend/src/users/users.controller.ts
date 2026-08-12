import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DataExportService } from './data-export.service.js';

import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { UsersService } from './users.service.js';

/** REST controller for user management and follow suggestions. */
@Controller('users')
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(DataExportService)
    private readonly dataExportService: DataExportService,
  ) {}

  /** Get suggested users to follow based on popularity. */
  @Get('suggestions')
  @UseGuards(JwtAuthGuard)
  async getSuggestions(
    @CurrentUser() user: CurrentUserData,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>[]> {
    return this.usersService.getSuggestions(
      user.userId,
      limit ? Number.parseInt(limit, 10) : 10,
    );
  }
  /** Ban a user (admin only). */
  @Patch(':id/ban')
  @UseGuards(AdminJwtAuthGuard, AdminGuard)
  @RequireStaffPermissions('users.ban')
  async banUser(@Param('id') id: string) {
    return this.usersService.banUser(id);
  }

  /** Unban a user (admin only). */
  @Patch(':id/unban')
  @UseGuards(AdminJwtAuthGuard, AdminGuard)
  @RequireStaffPermissions('users.ban')
  async unbanUser(@Param('id') id: string) {
    return this.usersService.unbanUser(id);
  }

  /** GDPR: Request Data Export (.zip). */
  @Get('gdpr/export')
  @UseGuards(JwtAuthGuard)
  async requestDataExport(@CurrentUser() user: CurrentUserData) {
    return this.dataExportService.requestDataExport(user.userId);
  }

  /** GDPR: Get Data Export History. */
  @Get('gdpr/exports')
  @UseGuards(JwtAuthGuard)
  async getExportHistory(@CurrentUser() user: CurrentUserData) {
    return this.dataExportService.getExportHistory(user.userId);
  }

  /** GDPR: Full account deletion (irreversible). */
  @Delete('gdpr/account')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@CurrentUser() user: CurrentUserData) {
    await this.usersService.deleteUser(user.userId);
    return { message: 'Account deleted successfully' };
  }

  /** DELETE /users/me: Scheduled account deletion (GDPR, 30-day grace). */
  @Delete('me')
  @UseGuards(JwtAuthGuard)
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

  /** POST /users/me/restore: Cancel scheduled deletion within the grace window. */
  @Post('me/restore')
  @UseGuards(JwtAuthGuard)
  async restoreMe(@CurrentUser() user: CurrentUserData) {
    return this.usersService.cancelScheduledDeletion(user.userId);
  }

  /** Get user settings. */
  @Get('me/settings')
  @UseGuards(JwtAuthGuard)
  async getSettings(@CurrentUser() user: CurrentUserData) {
    return this.usersService.getSettings(user.userId);
  }

  /** Update user settings. */
  @Put('me/settings')
  @UseGuards(JwtAuthGuard)
  async updateSettings(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.usersService.updateSettings(user.userId, dto);
  }

  // --- Identity Verification ---

  @Post('identity-session')
  @UseGuards(JwtAuthGuard)
  async createIdentitySession(
    @CurrentUser() user: CurrentUserData,
    @Body() body: { returnUrl?: string },
  ): Promise<{ url: string }> {
    return this.usersService.createIdentitySession(
      user.userId,
      body.returnUrl ||
        `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accounts/edit`,
    );
  }

  @Post('identity-session/sync')
  @UseGuards(JwtAuthGuard)
  async syncIdentitySession(
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ status: string }> {
    return this.usersService.syncIdentitySession(user.userId);
  }
}
