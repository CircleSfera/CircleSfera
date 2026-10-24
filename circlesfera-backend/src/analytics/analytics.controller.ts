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
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import { AnalyticsService } from './analytics.service.js';
import { CreateEventBatchDto, CreateEventDto } from './dto/create-event.dto.js';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService,
  ) {}

  // Log a single telemetry interaction event
  @Post('events')
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 201 })
  async logEvent(
    @CurrentUser('userId') userId: string | null,
    @Body() dto: CreateEventDto,
  ) {
    await this.analyticsService.logEvent(userId, dto);
    return { success: true };
  }

  // Log a batch of telemetry interaction events
  @Post(['events/batch', 'batch'])
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 201 })
  async logEventsBatch(
    @CurrentUser('userId') userId: string | null,
    @Body() dto: CreateEventBatchDto,
  ) {
    await this.analyticsService.logEventsBatch(userId, dto);
    return { success: true };
  }

  // Get dashboard statistics for the current user (creator)
  @ApiQuery({ name: 'days', required: false })
  @Get('dashboard')
  @MemberAllowed('analytics.read')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  async getDashboard(
    @CurrentUser('profileId') profileId: string,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getCreatorDashboard(
      profileId,
      days ? parseInt(days, 10) : 30,
    );
  }

  // Track a view for a specific post
  @Post('post/:id/view')
  @MemberAllowed('browse')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 201 })
  async trackView(
    @Param('id') postId: string,
    @CurrentUser('profileId') viewerId: string,
  ) {
    return this.analyticsService.trackPostView(postId, viewerId);
  }

  // Track a loop for a specific frame
  @Post('post/:id/loop')
  @MemberAllowed('browse')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 201 })
  async trackLoop(@Param('id') postId: string) {
    return this.analyticsService.trackFrameLoop(postId);
  }

  // Track watch time for a specific frame
  @Post('post/:id/watch')
  @MemberAllowed('browse')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 201 })
  async trackWatch(
    @Param('id') postId: string,
    @Query('seconds') seconds: string,
  ) {
    return this.analyticsService.trackFrameWatchTime(
      postId,
      parseFloat(seconds),
    );
  }

  // Get detailed insights for a specific post (author only)
  @Get('post/:id/insights')
  @MemberAllowed('analytics.read')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  async getPostInsights(
    @Param('id') postId: string,
    @CurrentUser('profileId') profileId: string,
  ) {
    return this.analyticsService.getPostInsights(postId, profileId);
  }

  // Manual trigger for testing aggregation (ADMIN only)
  @ApiQuery({ name: 'profileId', required: false })
  @Post('debug/aggregate')
  @UseGuards(AdminJwtAuthGuard, AdminGuard)
  @RequireStaffPermissions('system')
  @ApiResponse({ status: 201 })
  async debugAggregate(@Query('profileId') profileId?: string) {
    const id = profileId?.trim();
    if (!id) {
      throw new BadRequestException('profileId query parameter is required');
    }
    return this.analyticsService.performDailyAggregation(id);
  }
}
