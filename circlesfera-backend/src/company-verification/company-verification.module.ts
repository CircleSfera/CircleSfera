import { Module } from '@nestjs/common';
import { CryptoService } from '../common/services/crypto.service.js';
import { EmailModule } from '../email/email.module.js';
import { AdminCompanyVerificationController } from './admin-company-verification.controller.js';
import { CompanyVerificationController } from './company-verification.controller.js';
import { CompanyVerificationService } from './company-verification.service.js';
import { CompanyVerificationReviewService } from './company-verification-review.service.js';

@Module({
  imports: [EmailModule],
  controllers: [
    CompanyVerificationController,
    AdminCompanyVerificationController,
  ],
  providers: [
    CompanyVerificationService,
    CompanyVerificationReviewService,
    CryptoService,
  ],
  exports: [CompanyVerificationService],
})
export class CompanyVerificationModule {}
