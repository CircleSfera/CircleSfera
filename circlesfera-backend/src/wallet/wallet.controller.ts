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
// biome-ignore lint/style/useImportType: DI needs value
import { WalletService } from './wallet.service.js';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getWallet(@Req() req: AuthRequest) {
    return this.walletService.getWallet(req.user.userId);
  }

  @Get('transactions')
  async getTransactions(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.walletService.getTransactions(
      req.user.userId,
      page ? Number.parseInt(page, 10) : 1,
      limit ? Number.parseInt(limit, 10) : 20,
    );
  }

  @Post('purchase')
  async purchaseTokens(
    @Req() req: AuthRequest,
    @Body() body: { amount: number },
  ) {
    // In a real app, this would create a Stripe PaymentIntent.
    // For our virtual economy MVP, we instantly simulate the token purchase.
    return this.walletService.purchaseTokens(req.user.userId, body.amount);
  }

  @Post('tip')
  async sendTip(
    @Req() req: AuthRequest,
    @Body() body: { receiverId: string; amount: number; postId?: string },
  ) {
    return this.walletService.sendTip(
      req.user.userId,
      body.receiverId,
      body.amount,
      body.postId,
    );
  }

  @Post('unlock')
  async unlockPost(@Req() req: AuthRequest, @Body() body: { postId: string }) {
    return this.walletService.unlockPost(req.user.userId, body.postId);
  }

  @Post('payout')
  async requestPayout(
    @Req() req: AuthRequest,
    @Body() body: {
      amountTokens: number;
      payoutMethod: string;
      payoutDetails: string;
    },
  ) {
    return this.walletService.requestPayout(
      req.user.userId,
      body.amountTokens,
      body.payoutMethod,
      body.payoutDetails,
    );
  }
}
