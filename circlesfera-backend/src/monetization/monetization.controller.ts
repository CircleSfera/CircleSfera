import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ConnectStripeDto } from './dto/connect-stripe.dto.js';
import { SendTipDto } from './dto/send-tip.dto.js';
import { UnlockMessageDto } from './dto/unlock-message.dto.js';
import { UnlockPostDto } from './dto/unlock-post.dto.js';
import { UnlockStoryDto } from './dto/unlock-story.dto.js';
import { MonetizationService } from './monetization.service.js';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@ApiTags('Monetization')
@Controller('monetization')
@UseGuards(JwtAuthGuard)
export class MonetizationController {
  constructor(private readonly monetizationService: MonetizationService) {}

  @Get()
  async getMonetization(@Req() req: AuthRequest) {
    return this.monetizationService.getMonetization(req.user.userId);
  }

  @Get('transactions')
  async getTransactions(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.monetizationService.getTransactions(
      req.user.userId,
      page ? Number.parseInt(page, 10) : 1,
      limit ? Number.parseInt(limit, 10) : 20,
    );
  }

  @Get('status')
  async getStatus(@Req() req: AuthRequest) {
    return this.monetizationService.getAccountStatus(req.user.userId);
  }

  @Post('connect')
  @UseGuards(IdentityVerifiedGuard)
  async connectStripe(@Req() req: AuthRequest, @Body() body: ConnectStripeDto) {
    return this.monetizationService.onboardConnectAccount(
      req.user.userId,
      body.returnUrl,
      body.refreshUrl,
    );
  }

  @Post('tip')
  @UseGuards(IdentityVerifiedGuard)
  async sendTip(@Req() req: AuthRequest, @Body() body: SendTipDto) {
    return this.monetizationService.createTipSession(
      req.user.userId,
      body.receiverId,
      body.amountCents,
      body.returnUrl,
      body.postId,
      body.idempotencyKey,
    );
  }

  @Post('unlock')
  @UseGuards(IdentityVerifiedGuard)
  async unlockPost(@Req() req: AuthRequest, @Body() body: UnlockPostDto) {
    return this.monetizationService.createPostUnlockSession(
      req.user.userId,
      body.postId,
      body.returnUrl,
      body.idempotencyKey,
    );
  }

  @Post('unlock-story')
  @UseGuards(IdentityVerifiedGuard)
  async unlockStory(@Req() req: AuthRequest, @Body() body: UnlockStoryDto) {
    return this.monetizationService.createStoryUnlockSession(
      req.user.userId,
      body.storyId,
      body.returnUrl,
      body.idempotencyKey,
    );
  }

  @Post('unlock-message')
  @UseGuards(IdentityVerifiedGuard)
  async unlockMessage(@Req() req: AuthRequest, @Body() body: UnlockMessageDto) {
    return this.monetizationService.createMessageUnlockSession(
      req.user.userId,
      body.messageId,
      body.returnUrl,
    );
  }

  @Get('dashboard')
  async getDashboard(@Req() req: AuthRequest) {
    return this.monetizationService.getDashboardLink(req.user.userId);
  }

  @Get('payouts')
  async getPayouts(@Req() req: AuthRequest) {
    return this.monetizationService.getConnectPayoutsSummary(req.user.userId);
  }

  @Get('analytics/income')
  async getIncomeAnalytics(@Req() req: AuthRequest) {
    return this.monetizationService.getIncomeStats(req.user.userId);
  }

  @Get('analytics/summary')
  async getFinancialSummary(@Req() req: AuthRequest) {
    return this.monetizationService.getFinancialSummary(req.user.userId);
  }
}
