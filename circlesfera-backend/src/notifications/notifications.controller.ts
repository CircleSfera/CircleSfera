import { Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { NotificationsService } from './notifications.service.js';

// REST controller for notifications. All endpoints require authentication.
@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // List all notifications (paginated).
  @Get()
  @ApiResponse({ status: 200 })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() pagination: PaginationDto,
  ) {
    return this.notificationsService.findAll(user.profileId, pagination);
  }

  // Get the count of unread notifications.
  @Get('unread-count')
  @ApiResponse({ status: 200 })
  async getUnreadCount(@CurrentUser() user: CurrentUserData) {
    return this.notificationsService.getUnreadCount(user.profileId);
  }

  // Mark a single notification as read.
  @Put(':id/read')
  @ApiResponse({ status: 200, type: Object })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.notificationsService.markAsRead(id, user.profileId);
  }

  // Mark all notifications as read.
  @Put('read-all')
  @ApiResponse({ status: 200 })
  async markAllAsRead(@CurrentUser() user: CurrentUserData) {
    await this.notificationsService.markAllAsRead(user.profileId);
    return { success: true };
  }
}
