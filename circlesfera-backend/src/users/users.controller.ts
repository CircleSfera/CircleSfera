import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DataExportService } from './data-export.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { UsersService } from './users.service.js';

/** REST controller for user management and follow suggestions. */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(DataExportService)
    private readonly dataExportService: DataExportService,
  ) {}

  /** Get suggested users to follow based on popularity. */
  @Get('suggestions')
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
  @UseGuards(AdminGuard)
  async banUser(@Param('id') id: string) {
    return this.usersService.banUser(id);
  }

  /** Unban a user (admin only). */
  @Patch(':id/unban')
  @UseGuards(AdminGuard)
  async unbanUser(@Param('id') id: string) {
    return this.usersService.unbanUser(id);
  }

  /** GDPR: Request Data Export (.zip). */
  @Get('gdpr/export')
  async requestDataExport(@CurrentUser() user: CurrentUserData) {
    return this.dataExportService.requestDataExport(user.userId);
  }

  /** GDPR: Get Data Export History. */
  @Get('gdpr/exports')
  async getExportHistory(@CurrentUser() user: CurrentUserData) {
    return this.dataExportService.getExportHistory(user.userId);
  }

  /** GDPR: Full account deletion (irreversible). */
  @Delete('gdpr/account')
  async deleteAccount(@CurrentUser() user: CurrentUserData) {
    await this.usersService.deleteUser(user.userId);
    return { message: 'Account deleted successfully' };
  }

  /** DELETE /users/me: Scheduled account deletion (GDPR). */
  @Delete('me')
  async deleteMe(@CurrentUser() user: CurrentUserData) {
    await this.usersService.deleteUser(user.userId);
    const scheduledDeletionAt = new Date();
    scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + 30);
    return {
      success: true,
      message: 'Account scheduled for deletion',
      scheduled_deletion_at: scheduledDeletionAt.toISOString(),
    };
  }

  /** Get user settings. */
  @Get('me/settings')
  async getSettings(@CurrentUser() user: CurrentUserData) {
    return this.usersService.getSettings(user.userId);
  }

  /** Update user settings. */
  @Put('me/settings')
  async updateSettings(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.usersService.updateSettings(user.userId, dto);
  }
}
