import { Module } from '@nestjs/common';
import { StripeService } from '../common/stripe/stripe.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MonetizationController } from './monetization.controller.js';
import { MonetizationService } from './monetization.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [MonetizationController],
  providers: [MonetizationService, StripeService],
  exports: [MonetizationService],
})
export class MonetizationModule {}
