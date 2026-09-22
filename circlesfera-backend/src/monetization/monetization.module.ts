import { Module } from '@nestjs/common';
import { StripeModule } from '../common/stripe/stripe.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MonetizationController } from './monetization.controller.js';
import { MonetizationService } from './monetization.service.js';
import { MonetizationWebhookService } from './monetization-webhook.service.js';

@Module({
  imports: [PrismaModule, StripeModule],
  controllers: [MonetizationController],
  providers: [MonetizationService, MonetizationWebhookService],
  exports: [MonetizationService, MonetizationWebhookService],
})
export class MonetizationModule {}
