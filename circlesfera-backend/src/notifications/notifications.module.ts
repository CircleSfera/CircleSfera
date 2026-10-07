import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { registerRecurringJob } from '../common/queues/recurring-jobs.js';
import { PushModule } from '../push/push.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsProcessor } from './processors/notifications.processor.js';

@Module({
  imports: [
    PushModule,
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.NOTIFICATIONS_PROCESSING),
    ),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsModule.name);

  constructor(
    @InjectQueue('notifications-processing')
    private readonly notificationsQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await registerRecurringJob(
      this.notificationsQueue,
      'notifications_digest_cron',
      'send-digest-push',
      '*/15 * * * *',
    );
    await registerRecurringJob(
      this.notificationsQueue,
      'notifications_cleanup_cron',
      'cleanup-old-notifications',
      '0 0 * * *',
    );
    this.logger.log('Registered repeatable jobs for Notifications.');
  }
}
