import { Module } from '@nestjs/common';
import { CryptoService } from '../common/services/crypto.service.js';
import { EmailModule } from '../email/email.module.js';
import { CompanyVerificationController } from './company-verification.controller.js';
import { CompanyVerificationService } from './company-verification.service.js';

@Module({
  imports: [EmailModule],
  controllers: [CompanyVerificationController],
  providers: [CompanyVerificationService, CryptoService],
  exports: [CompanyVerificationService],
})
export class CompanyVerificationModule {}
