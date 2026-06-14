import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MonetizationService } from './monetization.service.js';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

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

  @Post('connect')
  async connectStripe(
    @Req() req: AuthRequest,
    @Body() body: { returnUrl: string; refreshUrl: string },
  ) {
    return this.monetizationService.onboardConnectAccount(
      req.user.userId,
      body.returnUrl,
      body.refreshUrl,
    );
  }

  @Post('tip')
  async sendTip(
    @Req() req: AuthRequest,
    @Body() body: {
      receiverId: string;
      amountCents: number;
      returnUrl: string;
      postId?: string;
    },
  ) {
    return this.monetizationService.createTipSession(
      req.user.userId,
      body.receiverId,
      body.amountCents,
      body.returnUrl,
      body.postId,
    );
  }

  @Post('unlock')
  async unlockPost(
    @Req() req: AuthRequest,
    @Body() body: { postId: string; returnUrl: string },
  ) {
    return this.monetizationService.createPostUnlockSession(
      req.user.userId,
      body.postId,
      body.returnUrl,
    );
  }

  @Get('dashboard')
  async getDashboard(@Req() req: AuthRequest) {
    return this.monetizationService.getDashboardLink(req.user.userId);
  }
}
