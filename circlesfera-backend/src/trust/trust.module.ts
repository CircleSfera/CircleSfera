import { Module } from '@nestjs/common';
import { AbuseModule } from '../common/abuse/abuse.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ActionLimitsService } from './action-limits.service.js';
import { RiskDetectorService } from './risk-detector.service.js';

// Spam and bot protection: per-Profile action caps, behavioural counters and
// the risk detector that opens cases for human review.
@Module({
  imports: [PrismaModule, NotificationsModule, AbuseModule],
  providers: [ActionLimitsService, RiskDetectorService],
  exports: [ActionLimitsService, RiskDetectorService],
})
export class TrustModule {}
