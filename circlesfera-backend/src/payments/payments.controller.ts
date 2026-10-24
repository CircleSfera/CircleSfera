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
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import type Stripe from 'stripe';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CheckoutDto } from './dto/checkout.dto.js';
import { PaymentsService } from './payments.service.js';

interface RequestWithUser extends Request {
  user: { userId: string; email: string; role: string; profileId: string };
}

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    @Inject(PaymentsService)
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('plans')
  @ApiResponse({ status: 200 })
  async getPlans() {
    return this.paymentsService.findAllPlans();
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, IdentityVerifiedGuard)
  @ApiResponse({ status: 201, type: Object })
  async createCheckout(
    @Req() req: RequestWithUser,
    @Body() body: CheckoutDto,
  ): Promise<Stripe.Checkout.Session | { url: string }> {
    return this.paymentsService.createCheckout(
      req.user.userId,
      body.planId,
      body.billingCycle,
      // A plan is bought for the Profile in use.
      req.user.profileId,
    );
  }

  @Get('portal')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, type: Object })
  async getPortal(
    @Req() req: RequestWithUser,
  ): Promise<Stripe.BillingPortal.Session | { url: string }> {
    return this.paymentsService.getPortalUrl(req.user.userId);
  }

  // Cancels the plan of the Profile in use at the end of the period paid.
  @Post('plan/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: HttpStatus.OK })
  async cancelPlan(@Req() req: RequestWithUser) {
    return this.paymentsService.cancelPlan(req.user.userId, req.user.profileId);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  async getBillingStatus(@Req() req: RequestWithUser) {
    return this.paymentsService.getBillingStatus(
      req.user.userId,
      req.user.profileId,
    );
  }

  @Get('ledger')
  @UseGuards(JwtAuthGuard)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="ledger.csv"')
  @ApiResponse({ status: 200, type: String })
  async getLedger(@Req() req: RequestWithUser): Promise<string> {
    return this.paymentsService.getLedgerCsv(req.user.userId);
  }

  @Get('admin/ledger')
  @UseGuards(AdminJwtAuthGuard, AdminGuard)
  @RequireStaffPermissions('payments')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="full-ledger.csv"')
  @ApiResponse({ status: 200, type: String })
  async getAdminLedger(): Promise<string> {
    return this.paymentsService.getLedgerCsv();
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
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
      this.logger.error(`Webhook Error: ${message}`);
      // 5xx so Stripe retries; processWebhookEvent marks FAILED for reprocess
      throw new InternalServerErrorException(message);
    }
  }
}
