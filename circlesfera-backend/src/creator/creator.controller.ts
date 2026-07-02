import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
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

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@Controller('creator')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
@RequiresPlan('Elite Creator')
export class CreatorController {
  constructor(
    @Inject(CreatorService)
    private readonly creatorService: CreatorService,
    private readonly creatorSubscriptionsService: CreatorSubscriptionsService,
  ) {}

  /** Creator stats for authenticated user. */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats(@Req() req: AuthRequest) {
    return this.creatorService.getStats(req.user.userId);
  }

  /** Activity chart (likes, comments, views per day for 14 days). */
  @Get('activity-chart')
  @HttpCode(HttpStatus.OK)
  async getActivityChart(@Req() req: AuthRequest) {
    return this.creatorService.getActivityChart(req.user.userId);
  }

  /** Paginated posts/frames with metrics. */
  @Get('posts')
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
  async createPromotion(
    @Req() req: AuthRequest,
    @Body()
    body: {
      targetType: string;
      targetId: string;
      budget: number;
      durationDays: number;
      currency?: string;
    },
  ) {
    if (
      !body.targetType ||
      !body.targetId ||
      !body.budget ||
      !body.durationDays
    ) {
      throw new BadRequestException('Missing required fields');
    }
    return this.creatorService.createPromotion(
      req.user.userId,
      body.targetType,
      body.targetId,
      body.budget,
      body.durationDays,
      body.currency,
    ) as Promise<unknown>;
  }

  /** Record a view for a promotion to deduct budget and increase reach. */
  @Post('promotions/:id/view')
  async recordPromotionView(@Param('id') id: string) {
    return this.creatorService.recordPromotionView(id);
  }

  /** Cancel a promotion. */
  @Delete('promotions/:id')
  async cancelPromotion(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.creatorService.cancelPromotion(
      req.user.userId,
      id,
    ) as Promise<unknown>;
  }

  // --- Subscriptions ---
  @Post('subscribe')
  async subscribe(
    @Req() req: AuthRequest,
    @Body() body: { creatorId: string; priceCents: number; returnUrl: string },
  ) {
    return this.creatorSubscriptionsService.createSubscriptionSession(
      req.user.userId,
      body.creatorId,
      body.priceCents,
      body.returnUrl,
    );
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
}
