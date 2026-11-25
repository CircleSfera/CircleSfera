import { Module } from '@nestjs/common';
import { ExperimentsModule } from '../experiments/experiments.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdsConsentController } from './ads-consent.controller.js';
import { AdsConsentService } from './ads-consent.service.js';

@Module({
  imports: [PrismaModule, ExperimentsModule],
  controllers: [AdsConsentController],
  providers: [AdsConsentService],
  exports: [AdsConsentService],
})
export class AdsConsentModule {}
