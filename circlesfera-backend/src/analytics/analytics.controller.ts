import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { AnalyticsService } from './analytics.service.js';
import { CreateEventBatchDto, CreateEventDto } from './dto/create-event.dto.js';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService,
  ) {}

  /** Log a single telemetry interaction event */
  @Post('events')
  @UseGuards(JwtOptionalGuard)
  async logEvent(
    @CurrentUser('id') userId: string | null,
    @Body() dto: CreateEventDto,
  ) {
    await this.analyticsService.logEvent(userId, dto);
    return { success: true };
  }

  /** Log a batch of telemetry interaction events */
  @Post('events/batch')
  @UseGuards(JwtOptionalGuard)
  async logEventsBatch(
    @CurrentUser('id') userId: string | null,
    @Body() dto: CreateEventBatchDto,
  ) {
    await this.analyticsService.logEventsBatch(userId, dto);
    return { success: true };
  }

  /** Get dashboard statistics for the current user (creator) */
  @Get('dashboard')
  async getDashboard(
    @CurrentUser('id') userId: string,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getCreatorDashboard(
      userId,
      days ? parseInt(days, 10) : 30,
    );
  }

  /** Track a view for a specific post */
  @Post('post/:id/view')
  async trackView(
    @Param('id') postId: string,
    @CurrentUser('id') viewerId: string,
  ) {
    return this.analyticsService.trackPostView(postId, viewerId);
  }

  /** Track a loop for a specific frame */
  @Post('post/:id/loop')
  async trackLoop(@Param('id') postId: string) {
    return this.analyticsService.trackFrameLoop(postId);
  }

  /** Track watch time for a specific frame */
  @Post('post/:id/watch')
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
  async getPostInsights(@Param('id') postId: string) {
    return this.analyticsService.getPostInsights(postId);
  }

  /** Manual trigger for testing aggregation (temporary) */
  @Post('debug/aggregate')
  async debugAggregate(@CurrentUser('id') userId: string) {
    return this.analyticsService.performDailyAggregation(userId);
  }
}
