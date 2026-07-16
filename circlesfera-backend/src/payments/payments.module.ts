import { forwardRef, Module } from '@nestjs/common';
import { StripeService } from '../common/stripe/stripe.service.js';
import { EmailModule } from '../email/email.module.js';
import { MonetizationModule } from '../monetization/monetization.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [PrismaModule, forwardRef(() => MonetizationModule), EmailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
