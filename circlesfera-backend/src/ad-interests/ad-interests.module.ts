import { Module } from '@nestjs/common';
import { ExperimentsModule } from '../experiments/experiments.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdInterestsController } from './ad-interests.controller.js';
import { AdInterestsService } from './ad-interests.service.js';

@Module({
  imports: [PrismaModule, ExperimentsModule],
  controllers: [AdInterestsController],
  providers: [AdInterestsService],
  // interestsForAds, for the ad server when there is one.
  exports: [AdInterestsService],
})
export class AdInterestsModule {}
