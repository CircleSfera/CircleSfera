import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  InternalServerErrorException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CheckoutDto } from './dto/checkout.dto.js';
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
    @Body() body: CheckoutDto,
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

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getBillingStatus(@Req() req: RequestWithUser) {
    return this.paymentsService.getBillingStatus(req.user.userId);
  }

  @Get('ledger')
  @UseGuards(JwtAuthGuard)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="ledger.csv"')
  async getLedger(@Req() req: RequestWithUser): Promise<string> {
    return this.paymentsService.getLedgerCsv(req.user.userId);
  }

  @Get('admin/ledger')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="full-ledger.csv"')
  async getAdminLedger(): Promise<string> {
    return this.paymentsService.getLedgerCsv();
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() req: Request) {
    const sig = req.headers['stripe-signature'] as string | undefined;

    if (!sig) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const rawBody = (req as { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new BadRequestException('rawBody not found');
    }

    try {
      const event = this.paymentsService.constructEvent(rawBody, sig);
      await this.paymentsService.processWebhookEvent(event);
      return { received: true };
    } catch (err: unknown) {
      if (
        err instanceof BadRequestException ||
        err instanceof InternalServerErrorException
      ) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Webhook Error: ${message}`);
      // 5xx so Stripe retries; processWebhookEvent marks FAILED for reprocess
      throw new InternalServerErrorException(message);
    }
  }
}
