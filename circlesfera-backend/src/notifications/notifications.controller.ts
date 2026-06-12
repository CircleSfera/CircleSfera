import { Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { PaginationDto } from '../common/dto/pagination.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for DI
import { NotificationsService } from './notifications.service.js';

/** REST controller for notifications. All endpoints require authentication. */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** List all notifications (paginated). */
  @Get()
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() pagination: PaginationDto,
  ) {
    return this.notificationsService.findAll(user.userId, pagination);
  }

  /** Get the count of unread notifications. */
  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: CurrentUserData) {
    return this.notificationsService.getUnreadCount(user.userId);
  }

  /** Mark a single notification as read. */
  @Put(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.notificationsService.markAsRead(id, user.userId);
  }

  /** Mark all notifications as read. */
  @Put('read-all')
  async markAllAsRead(@CurrentUser() user: CurrentUserData) {
    await this.notificationsService.markAllAsRead(user.userId);
    return { success: true };
  }
}
