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
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SubscriptionGuard } from '../auth/guards/subscription.guard.js';
import { CreatorService } from './creator.service.js';
import { CreatorSubscriptionsService } from './creator-subscriptions.service.js';
import { SubscribeCreatorDto } from './dto/subscribe-creator.dto.js';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

const ElitePlan = () => RequiresPlan('Elite Creator');

@Controller('creator')
@UseGuards(JwtAuthGuard)
export class CreatorController {
  constructor(
    @Inject(CreatorService)
    private readonly creatorService: CreatorService,
    private readonly creatorSubscriptionsService: CreatorSubscriptionsService,
  ) {}

  /** Creator stats for authenticated user. */
  @Get('stats')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  @HttpCode(HttpStatus.OK)
  async getStats(@Req() req: AuthRequest) {
    return this.creatorService.getStats(req.user.userId);
  }

  /** Activity chart (likes, comments, views per day for 14 days). */
  @Get('activity-chart')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  @HttpCode(HttpStatus.OK)
  async getActivityChart(@Req() req: AuthRequest) {
    return this.creatorService.getActivityChart(req.user.userId);
  }

  /** Paginated posts/frames with metrics. */
  @Get('posts')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async getPosts(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.creatorService.getPosts(
      req.user.userId,
      page ? Number.parseInt(page, 10) : 1,
      limit ? Number.parseInt(limit, 10) : 10,
      type,
    );
  }

  /** Paginated stories with metrics. */
  @Get('stories')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async getStories(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.creatorService.getStories(
      req.user.userId,
      page ? Number.parseInt(page, 10) : 1,
      limit ? Number.parseInt(limit, 10) : 10,
    );
  }

  /** Get my promotions. */
  @Get('promotions')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async getPromotions(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.creatorService.getPromotions(
      req.user.userId,
      page ? Number.parseInt(page, 10) : 1,
      limit ? Number.parseInt(limit, 10) : 10,
    );
  }

  /** Create a promotion (simulated payment). */
  @Post('promotions')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async createPromotion(
    @Req() req: AuthRequest,
    @Body()
    body: {
      targetType: string;
      targetId: string;
      budget?: number; // Optional if dailyBudget is provided
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
    return this.creatorService.createPromotion(
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

  /** Record a view for a promotion to deduct budget and increase reach. */
  @Post('promotions/:id/view')
  async recordPromotionView(@Param('id') id: string) {
    return this.creatorService.recordPromotionView(id);
  }

  /** Cancel a promotion. */
  @Delete('promotions/:id')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async cancelPromotion(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.creatorService.cancelPromotion(
      req.user.userId,
      id,
    ) as Promise<unknown>;
  }

  /** Edit targeting / schedule for an active or pending promotion. */
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
    return this.creatorService.updatePromotion(
      req.user.userId,
      id,
      body,
    ) as Promise<unknown>;
  }

  // --- Subscriptions (any authenticated fan) ---
  @Post('subscribe')
  async subscribe(@Req() req: AuthRequest, @Body() body: SubscribeCreatorDto) {
    return this.creatorSubscriptionsService.createSubscriptionSession(
      req.user.userId,
      body.creatorId,
      body.priceCents,
      body.returnUrl,
    );
  }

  @Get('subscriptions/me')
  async getMySubscriptions(@Req() req: AuthRequest) {
    return this.creatorSubscriptionsService.getMySubscriptions(req.user.userId);
  }

  @Get('subscription/:creatorId')
  async checkSubscription(
    @Req() req: AuthRequest,
    @Param('creatorId') creatorId: string,
  ) {
    return this.creatorSubscriptionsService.checkSubscription(
      req.user.userId,
      creatorId,
    );
  }

  @Delete('subscription/:creatorId')
  async cancelSubscription(
    @Req() req: AuthRequest,
    @Param('creatorId') creatorId: string,
  ) {
    return this.creatorSubscriptionsService.cancelSubscription(
      req.user.userId,
      creatorId,
    );
  }

  // --- Advanced Analytics ---

  @Get('analytics/revenue')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async getRevenueAnalytics(
    @Req() req: AuthRequest,
    @Query('period') period?: '7d' | '30d' | '90d' | '1y',
  ) {
    return this.creatorService.getRevenueAnalytics(req.user.userId, period);
  }

  @Get('analytics/retention')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async getAudienceRetentionAnalytics(@Req() req: AuthRequest) {
    return this.creatorService.getAudienceRetentionAnalytics(req.user.userId);
  }

  @Get('analytics/top-posts')
  @UseGuards(SubscriptionGuard)
  @ElitePlan()
  async getTopPerformingContent(
    @Req() req: AuthRequest,
    @Query('limit') limit?: string,
  ) {
    return this.creatorService.getTopPerformingContent(
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
    return this.creatorService.exportAnalyticsCsv(
      req.user.userId,
      period || '30d',
    );
  }
}
