import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
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
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { AnalyticsService } from './analytics.service.js';
import { CreateEventBatchDto, CreateEventDto } from './dto/create-event.dto.js';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService,
  ) {}

  /** Log a single telemetry interaction event */
  @Post('events')
  @UseGuards(JwtOptionalGuard)
  async logEvent(
    @CurrentUser('userId') userId: string | null,
    @Body() dto: CreateEventDto,
  ) {
    await this.analyticsService.logEvent(userId, dto);
    return { success: true };
  }

  /** Log a batch of telemetry interaction events */
  @Post(['events/batch', 'batch'])
  @UseGuards(JwtOptionalGuard)
  async logEventsBatch(
    @CurrentUser('userId') userId: string | null,
    @Body() dto: CreateEventBatchDto,
  ) {
    await this.analyticsService.logEventsBatch(userId, dto);
    return { success: true };
  }

  /** Get dashboard statistics for the current user (creator) */
  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  async getDashboard(
    @CurrentUser('profileId') profileId: string,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getCreatorDashboard(
      profileId,
      days ? parseInt(days, 10) : 30,
    );
  }

  /** Track a view for a specific post */
  @Post('post/:id/view')
  @UseGuards(JwtAuthGuard)
  async trackView(
    @Param('id') postId: string,
    @CurrentUser('profileId') viewerId: string,
  ) {
    return this.analyticsService.trackPostView(postId, viewerId);
  }

  /** Track a loop for a specific frame */
  @Post('post/:id/loop')
  @UseGuards(JwtAuthGuard)
  async trackLoop(@Param('id') postId: string) {
    return this.analyticsService.trackFrameLoop(postId);
  }

  /** Track watch time for a specific frame */
  @Post('post/:id/watch')
  @UseGuards(JwtAuthGuard)
  async trackWatch(
    @Param('id') postId: string,
    @Query('seconds') seconds: string,
  ) {
    return this.analyticsService.trackFrameWatchTime(
      postId,
      parseFloat(seconds),
    );
  }

  /** Get detailed insights for a specific post */
  @Get('post/:id/insights')
  @UseGuards(JwtAuthGuard)
  async getPostInsights(@Param('id') postId: string) {
    return this.analyticsService.getPostInsights(postId);
  }

  /** Manual trigger for testing aggregation (ADMIN only) */
  @Post('debug/aggregate')
  @UseGuards(AdminJwtAuthGuard, AdminGuard)
  @RequireStaffPermissions('system')
  async debugAggregate(@Query('profileId') profileId?: string) {
    const id = profileId?.trim();
    if (!id) {
      throw new BadRequestException('profileId query parameter is required');
    }
    return this.analyticsService.performDailyAggregation(id);
  }
}
