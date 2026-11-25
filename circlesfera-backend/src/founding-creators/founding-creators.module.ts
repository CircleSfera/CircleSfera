import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { AdminFoundingCreatorsController } from './admin-founding-creators.controller.js';
import { FoundingCreatorsController } from './founding-creators.controller.js';
import { FoundingCreatorsService } from './founding-creators.service.js';
import { FoundingCreatorsReviewService } from './founding-creators-review.service.js';

// Founding creators (BD-034): the application, the Backoffice queue, and
// the free year of Verified, given through the payments module.
@Module({
  imports: [PaymentsModule],
  controllers: [FoundingCreatorsController, AdminFoundingCreatorsController],
  providers: [FoundingCreatorsService, FoundingCreatorsReviewService],
})
export class FoundingCreatorsModule {}
