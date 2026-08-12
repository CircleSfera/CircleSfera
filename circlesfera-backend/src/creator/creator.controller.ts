import {
  BadRequestException,
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
import type { Request } from 'express';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SubscriptionGuard } from '../auth/guards/subscription.guard.js';

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
  user: { userId: string; email: string; role: string };
}

const ElitePlan = () => RequiresPlan('Elite Creator');

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
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  @HttpCode(HttpStatus.OK)
  async getStats(@Req() req: AuthRequest) {
    return this.getCreatorStatsQ.execute(req.user.userId);
  }

  @Get('activity-chart')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  @HttpCode(HttpStatus.OK)
  async getActivityChart(@Req() req: AuthRequest) {
    const dashboard = await this.analyticsService.getCreatorDashboard(
      req.user.userId,
      14,
    );
    return dashboard.charts.dailyMetrics;
  }

  @Get('posts')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async getPosts(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.getCreatorPostsQ.execute(
      req.user.userId,
      page ? Number.parseInt(page, 10) : 1,
      limit ? Number.parseInt(limit, 10) : 10,
      type,
    );
  }

  @Get('stories')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async getStories(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.getCreatorStoriesQ.execute(
      req.user.userId,
      page ? Number.parseInt(page, 10) : 1,
      limit ? Number.parseInt(limit, 10) : 10,
    );
  }

  @Get('promotions')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
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
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async createPromotion(
    @Req() req: AuthRequest,
    @Body()
    body: {
      targetType: string;
      targetId: string;
      budget?: number;
      dailyBudget?: number;
      durationDays: number;
      currency?: string;
      objective?: string;
      interests?: string;
      countries?: string;
    },
  ) {
    if (
      !body.targetType ||
      !body.targetId ||
      (!body.budget && !body.dailyBudget) ||
      !body.durationDays
    ) {
      throw new BadRequestException('Missing required fields');
    }
    return this.createPromotionUC.execute(
      req.user.userId,
      body.targetType,
      body.targetId,
      body.durationDays,
      body.budget,
      body.currency,
      body.objective,
      body.interests,
      body.countries,
      body.dailyBudget,
    ) as Promise<unknown>;
  }

  @Post('promotions/:id/view')
  async recordPromotionView(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.recordPromotionInteractionUC.recordView(id, req.user.userId);
  }

  @Delete('promotions/:id')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async cancelPromotion(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.managePromotionUC.cancelPromotion(
      req.user.userId,
      id,
    ) as Promise<unknown>;
  }

  @Post('promotions/:id/pause')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async pausePromotion(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.managePromotionUC.pausePromotion(
      req.user.userId,
      id,
    ) as Promise<unknown>;
  }

  @Post('promotions/:id/resume')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async resumePromotion(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.managePromotionUC.resumePromotion(
      req.user.userId,
      id,
    ) as Promise<unknown>;
  }

  @Post('promotions/:id/click')
  async recordPromotionClick(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.recordPromotionInteractionUC.recordClick(id, req.user?.userId);
  }

  @Patch('promotions/:id')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async updatePromotion(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body()
    body: {
      objective?: string;
      interests?: string;
      countries?: string;
      endDate?: string;
      dailyBudget?: number;
    },
  ) {
    return this.managePromotionUC.updatePromotion(
      req.user.userId,
      id,
      body,
    ) as Promise<unknown>;
  }

  @Get('analytics/revenue')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async getRevenueAnalytics(
    @Req() req: AuthRequest,
    @Query('period') period?: '7d' | '30d' | '90d' | '1y',
  ) {
    return this.getRevenueAnalyticsQ.execute(req.user.userId, period);
  }

  @Get('analytics/retention')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async getAudienceRetentionAnalytics(@Req() req: AuthRequest) {
    return this.getAudienceRetentionQ.execute(req.user.userId);
  }

  @Get('analytics/top-posts')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async getTopPerformingContent(
    @Req() req: AuthRequest,
    @Query('limit') limit?: string,
  ) {
    return this.getTopContentQ.execute(
      req.user.userId,
      limit ? Number.parseInt(limit, 10) : 5,
    );
  }

  @Get('analytics/export')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  @Header('Content-Type', 'text/csv')
  @Header(
    'Content-Disposition',
    'attachment; filename="circlesfera-analytics-report.csv"',
  )
  async exportAnalyticsCsv(
    @Req() req: AuthRequest,
    @Query('period') period?: string,
  ) {
    return this.exportAnalyticsCsvUC.execute(req.user.userId, period || '30d');
  }
}
