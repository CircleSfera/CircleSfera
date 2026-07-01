import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PushModule } from '../push/push.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsProcessor } from './processors/notifications.processor.js';

@Module({
  imports: [
    PushModule,
    BullModule.registerQueue({
      name: 'notifications-processing',
    }),
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
    await this.notificationsQueue.add(
      'send-digest-push',
      {},
      {
        repeat: { pattern: '*/15 * * * *' },
        jobId: 'notifications_digest_cron',
      },
    );
    await this.notificationsQueue.add(
      'cleanup-old-notifications',
      {},
      {
        repeat: { pattern: '0 0 * * *' },
        jobId: 'notifications_cleanup_cron',
      },
    );
    this.logger.log('Registered repeatable jobs for Notifications.');
  }
}
