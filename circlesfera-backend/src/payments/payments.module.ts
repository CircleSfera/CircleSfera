import { Module } from '@nestjs/common';
import { StripeModule } from '../common/stripe/stripe.module.js';
import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { PaymentEventsService } from './payment-events.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { ProviderDeliveryWatchService } from './provider-delivery-watch.service.js';

@Module({
  imports: [PrismaModule, EmailModule, UsersModule, StripeModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentEventsService,
    ProviderDeliveryWatchService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
