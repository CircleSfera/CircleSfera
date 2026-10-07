import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import {
  registerRecurringJob,
  removeRecurringJob,
} from '../common/queues/recurring-jobs.js';
import { StripeModule } from '../common/stripe/stripe.module.js';
import { EmailModule } from '../email/email.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { AccountDeletionProcessor } from './account-deletion.processor.js';
import { DataExportProcessor } from './data-export.processor.js';
import { DataExportService } from './data-export.service.js';
import { UsersController } from './users.controller.js';
import { UsersProcessor } from './users.processor.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    UploadsModule,
    OutboxModule,
    StripeModule,
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.USERS_PROCESSING),
    ),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    DataExportService,
    DataExportProcessor,
    AccountDeletionProcessor,
    UsersProcessor,
  ],
  exports: [UsersService],
})
export class UsersModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersModule.name);

  constructor(
    @InjectQueue('users-processing') private readonly usersQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    // SearchHistory TTL purge consolidated into
    // MaintenanceService.cleanupOldSearchHistory (the only implementation that
    // ever actually matched rows, since expiresAt was never populated here).
    // Remove any pre-existing repeatable registration from before this change
    // so it doesn't keep firing against a handler that no longer exists.
    await removeRecurringJob(this.usersQueue, 'clean-expired-search-history');
    await registerRecurringJob(
      this.usersQueue,
      'gdpr_exports_cron',
      'clean-expired-data-exports',
      '0 3 * * *',
    );
    await registerRecurringJob(
      this.usersQueue,
      'gdpr_accounts_cron',
      'clean-expired-accounts',
      '0 4 * * *',
    );

    this.logger.log('Registered repeatable GDPR jobs.');
  }
}
