import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AbuseModule } from '../common/abuse/abuse.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ActionLimitsService } from './action-limits.service.js';
import { RiskDetectorService } from './risk-detector.service.js';
import { TRUST_REDIS, trustRedisProvider } from './trust-redis.provider.js';

// Spam and bot protection: per-Profile action caps, behavioural counters and
// the risk detector that opens cases for human review.
@Module({
  imports: [PrismaModule, NotificationsModule, AbuseModule],
  providers: [trustRedisProvider, ActionLimitsService, RiskDetectorService],
  exports: [ActionLimitsService, RiskDetectorService],
})
export class TrustModule implements OnModuleDestroy {
  constructor(@Inject(TRUST_REDIS) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
