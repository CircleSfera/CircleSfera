import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { CreatorController } from './creator.controller.js';
import { CreatorService } from './creator.service.js';
import { CreatorSubscriptionsService } from './creator-subscriptions.service.js';

@Module({
  imports: [PrismaModule, AnalyticsModule, WalletModule],
  controllers: [CreatorController],
  providers: [CreatorService, CreatorSubscriptionsService, StripeService],
})
export class CreatorModule {}
