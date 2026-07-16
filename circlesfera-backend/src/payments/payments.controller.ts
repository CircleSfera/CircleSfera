import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaymentsService } from './payments.service.js';

interface RequestWithUser extends Request {
  user: { userId: string; email: string; role: string };
}

@Controller('payments')
export class PaymentsController {
  constructor(
    @Inject(PaymentsService)
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('plans')
  async getPlans() {
    return this.paymentsService.findAllPlans();
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, IdentityVerifiedGuard)
  async createCheckout(
    @Req() req: RequestWithUser,
    @Body() body: { planId: string; billingCycle?: 'MONTHLY' | 'YEARLY' },
  ): Promise<Stripe.Checkout.Session | { url: string }> {
    return this.paymentsService.createCheckout(
      req.user.userId,
      body.planId,
      body.billingCycle,
    );
  }

  @Get('portal')
  @UseGuards(JwtAuthGuard)
  async getPortal(
    @Req() req: RequestWithUser,
  ): Promise<Stripe.BillingPortal.Session | { url: string }> {
    return this.paymentsService.getPortalUrl(req.user.userId);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() req: Request) {
    const sig = req.headers['stripe-signature'] as string | undefined;

    if (!sig) {
      return { received: false, error: 'Missing stripe-signature header' };
    }

    try {
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        return { received: false, error: 'rawBody not found' };
      }
      const event = this.paymentsService.constructEvent(rawBody, sig);
      await this.paymentsService.processWebhookEvent(event);
      return { received: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Webhook Error: ${message}`);
      return { received: false, error: message };
    }
  }

}
