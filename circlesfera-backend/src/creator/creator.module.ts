import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { MonetizationModule } from '../monetization/monetization.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CreatorController } from './creator.controller.js';
import { CreatorService } from './creator.service.js';
import { CreatorSubscriptionsService } from './creator-subscriptions.service.js';

@Module({
  imports: [PrismaModule, AnalyticsModule, MonetizationModule],
  controllers: [CreatorController],
  providers: [CreatorService, CreatorSubscriptionsService, StripeService],
})
export class CreatorModule {}
