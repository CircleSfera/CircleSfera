import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { SocketModule } from '../socket/socket.module.js';
import { OperationalMetricsService } from './operational-metrics.service.js';

/**
 * The queues OperationalMetricsService watches (ADR-0024's queue and media
 * tier). Each must be registered here: an @Optional @InjectQueue of a queue
 * this module does not register resolves to nothing, and the tier watches
 * no queue at all.
 */
export const OBSERVED_QUEUES = [
  QUEUE_NAMES.VIDEO_TRANSCODING,
  QUEUE_NAMES.NOTIFICATIONS_PROCESSING,
  QUEUE_NAMES.CHAT_PROCESSING,
  QUEUE_NAMES.FEED_FANOUT,
  QUEUE_NAMES.USERS_PROCESSING,
  QUEUE_NAMES.ANALYTICS_PROCESSING,
  QUEUE_NAMES.AI_PROCESSING,
] as const;

@Global()
@Module({
  imports: [
    SocketModule,
    BullModule.registerQueue(...OBSERVED_QUEUES.map(getRegisterQueueOptions)),
  ],
  providers: [OperationalMetricsService],
  exports: [OperationalMetricsService],
})
export class ObservabilityModule {}
