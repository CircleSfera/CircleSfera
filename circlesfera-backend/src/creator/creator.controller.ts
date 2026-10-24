import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { type CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { CreatorAccountGuard } from '../auth/guards/creator-account.guard.js';
import { ElitePlanGuard } from '../auth/guards/elite-plan.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import {
  CreatePromotionDto,
  UpdatePromotionDto,
} from './dto/create-promotion.dto.js';
// Analytics
import { ExportAnalyticsCsvUseCase } from './use-cases/analytics/commands/export-analytics-csv.use-case.js';
import { GetAudienceRetentionQuery } from './use-cases/analytics/queries/get-audience-retention.query.js';
import { GetCreatorStatsQuery } from './use-cases/analytics/queries/get-creator-stats.query.js';
import { GetRevenueAnalyticsQuery } from './use-cases/analytics/queries/get-revenue-analytics.query.js';
import { GetTopContentQuery } from './use-cases/analytics/queries/get-top-content.query.js';
// Content
import { GetCreatorPostsQuery } from './use-cases/content/queries/get-creator-posts.query.js';
import { GetCreatorStoriesQuery } from './use-cases/content/queries/get-creator-stories.query.js';
// Promotions
import { CreatePromotionUseCase } from './use-cases/promotions/commands/create-promotion.use-case.js';
import { ManagePromotionUseCase } from './use-cases/promotions/commands/manage-promotion.use-case.js';
import { RecordPromotionInteractionUseCase } from './use-cases/promotions/commands/record-promotion-interaction.use-case.js';
import { GetPromotionsQuery } from './use-cases/promotions/queries/get-promotions.query.js';

interface AuthRequest extends Request {
  user: CurrentUserData;
}

@Controller('creator')
@UseGuards(JwtAuthGuard)
export class CreatorController {
  constructor(
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService,
    // Analytics
    @Inject(GetCreatorStatsQuery)
    private readonly getCreatorStatsQ: GetCreatorStatsQuery,
    @Inject(GetRevenueAnalyticsQuery)
    private readonly getRevenueAnalyticsQ: GetRevenueAnalyticsQuery,
    @Inject(GetAudienceRetentionQuery)
    private readonly getAudienceRetentionQ: GetAudienceRetentionQuery,
    @Inject(GetTopContentQuery)
    private readonly getTopContentQ: GetTopContentQuery,
    @Inject(ExportAnalyticsCsvUseCase)
    private readonly exportAnalyticsCsvUC: ExportAnalyticsCsvUseCase,
    // Content
    @Inject(GetCreatorPostsQuery)
    private readonly getCreatorPostsQ: GetCreatorPostsQuery,
    @Inject(GetCreatorStoriesQuery)
    private readonly getCreatorStoriesQ: GetCreatorStoriesQuery,
    // Promotions
    @Inject(GetPromotionsQuery)
    private readonly getPromotionsQ: GetPromotionsQuery,
    @Inject(CreatePromotionUseCase)
    private readonly createPromotionUC: CreatePromotionUseCase,
    @Inject(ManagePromotionUseCase)
    private readonly managePromotionUC: ManagePromotionUseCase,
    @Inject(RecordPromotionInteractionUseCase)
    private readonly recordPromotionInteractionUC: RecordPromotionInteractionUseCase,
  ) {}

  @Get('stats')
  @MemberAllowed('analytics.read')
  @UseGuards(CreatorAccountGuard)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  async getStats(@Req() req: AuthRequest) {
    return this.getCreatorStatsQ.execute(req.user.profileId);
  }

  @Get('activity-chart')
  @MemberAllowed('analytics.read')
  @UseGuards(CreatorAccountGuard)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  async getActivityChart(@Req() req: AuthRequest) {
    const dashboard = await this.analyticsService.getCreatorDashboard(
      req.user.profileId,
      14,
    );
    return dashboard.charts.dailyMetrics;
  }

  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'type', required: false })
  @Get('posts')
  @MemberAllowed('analytics.read')
  @UseGuards(CreatorAccountGuard)
  @ApiResponse({ status: 200 })
  async getPosts(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.getCreatorPostsQ.execute(
      req.user.profileId,
      page ? Number.parseInt(page, 10) : 1,
      limit ? Number.parseInt(limit, 10) : 10,
      type,
    );
  }

  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Get('stories')
  @MemberAllowed('analytics.read')
  @UseGuards(CreatorAccountGuard)
  @ApiResponse({ status: 200 })
  async getStories(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.getCreatorStoriesQ.execute(
      req.user.profileId,
      page ? Number.parseInt(page, 10) : 1,
      limit ? Number.parseInt(limit, 10) : 10,
    );
  }

  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Get('promotions')
  @UseGuards(CreatorAccountGuard)
  @ApiResponse({ status: 200 })
  async getPromotions(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.getPromotionsQ.execute(
      req.user.userId,
      page ? Number.parseInt(page, 10) : 1,
      limit ? Number.parseInt(limit, 10) : 10,
    );
  }

  @Post('promotions')
  @UseGuards(CreatorAccountGuard)
  @ApiResponse({ status: 201, type: Object })
  async createPromotion(
    @Req() req: AuthRequest,
    @Body() body: CreatePromotionDto,
  ) {
    return this.createPromotionUC.execute(
      req.user.userId,
      body.targetType,
      body.targetId,
      body.durationDays,
      body.dailyBudget,
      body.currency,
      body.countries,
    ) as Promise<unknown>;
  }

  @Post('promotions/:id/view')
  @ApiResponse({ status: 201 })
  async recordPromotionView(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.recordPromotionInteractionUC.recordView(id, req.user.userId);
  }

  @Delete('promotions/:id')
  @UseGuards(CreatorAccountGuard)
  @ApiResponse({ status: 200, type: Object })
  async cancelPromotion(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.managePromotionUC.cancelPromotion(
      req.user.userId,
      id,
    ) as Promise<unknown>;
  }

  @Post('promotions/:id/pause')
  @UseGuards(CreatorAccountGuard)
  @ApiResponse({ status: 201, type: Object })
  async pausePromotion(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.managePromotionUC.pausePromotion(
      req.user.userId,
      id,
    ) as Promise<unknown>;
  }

  @Post('promotions/:id/resume')
  @UseGuards(CreatorAccountGuard)
  @ApiResponse({ status: 201, type: Object })
  async resumePromotion(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.managePromotionUC.resumePromotion(
      req.user.userId,
      id,
    ) as Promise<unknown>;
  }

  @Post('promotions/:id/click')
  @ApiResponse({ status: 201 })
  async recordPromotionClick(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.recordPromotionInteractionUC.recordClick(id, req.user.userId);
  }

  @Patch('promotions/:id')
  @UseGuards(CreatorAccountGuard)
  @ApiResponse({ status: 200, type: Object })
  async updatePromotion(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpdatePromotionDto,
  ) {
    return this.managePromotionUC.updatePromotion(
      req.user.userId,
      id,
      body,
    ) as Promise<unknown>;
  }

  // Advanced analytics come with the Elite Creator and Business plans. The
  // summary, the content lists, promotions and earning stay with the kind of
  // account alone.
  @ApiQuery({ name: 'period', required: false })
  @Get('analytics/revenue')
  @UseGuards(CreatorAccountGuard, ElitePlanGuard)
  @ApiResponse({ status: 200 })
  async getRevenueAnalytics(
    @Req() req: AuthRequest,
    @Query('period') period?: '7d' | '30d' | '90d' | '1y',
  ) {
    // Transaction.receiverId stores User.id; followers are counted by
    // Profile.id.
    return this.getRevenueAnalyticsQ.execute(
      req.user.userId,
      req.user.profileId,
      period,
    );
  }

  @Get('analytics/retention')
  @MemberAllowed('analytics.read')
  @UseGuards(CreatorAccountGuard, ElitePlanGuard)
  @ApiResponse({ status: 200 })
  async getAudienceRetentionAnalytics(@Req() req: AuthRequest) {
    return this.getAudienceRetentionQ.execute(req.user.profileId);
  }

  @ApiQuery({ name: 'limit', required: false })
  @Get('analytics/top-posts')
  @MemberAllowed('analytics.read')
  @UseGuards(CreatorAccountGuard, ElitePlanGuard)
  @ApiResponse({ status: 200 })
  async getTopPerformingContent(
    @Req() req: AuthRequest,
    @Query('limit') limit?: string,
  ) {
    return this.getTopContentQ.execute(
      req.user.profileId,
      limit ? Number.parseInt(limit, 10) : 5,
    );
  }

  @ApiQuery({ name: 'period', required: false })
  @Get('analytics/export')
  @UseGuards(CreatorAccountGuard, ElitePlanGuard)
  @Header('Content-Type', 'text/csv')
  @Header(
    'Content-Disposition',
    'attachment; filename="circlesfera-analytics-report.csv"',
  )
  @ApiResponse({ status: 200, type: String })
  async exportAnalyticsCsv(
    @Req() req: AuthRequest,
    @Query('period') period?: string,
  ) {
    // Same receiverId/User.id vs Profile.id note as getRevenueAnalytics above —
    // this export reuses both GetRevenueAnalyticsQuery (userId) and
    // GetAudienceRetentionQuery (profileId).
    return this.exportAnalyticsCsvUC.execute(
      req.user.userId,
      req.user.profileId,
      period || '30d',
    );
  }
}
