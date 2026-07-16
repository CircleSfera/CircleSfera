import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { DataExportService } from './data-export.service.js';
import { GdprProcessor } from './gdpr.processor.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    BullModule.registerQueue({
      name: 'users-processing',
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, DataExportService, GdprProcessor, StripeService],
  exports: [UsersService],
})
export class UsersModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersModule.name);

  constructor(
    @InjectQueue('users-processing') private readonly usersQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.usersQueue.add(
      'clean-expired-search-history',
      {},
      { repeat: { pattern: '0 2 * * *' }, jobId: 'gdpr_search_cron' },
    );
    await this.usersQueue.add(
      'clean-expired-data-exports',
      {},
      { repeat: { pattern: '0 3 * * *' }, jobId: 'gdpr_exports_cron' },
    );
    await this.usersQueue.add(
      'clean-expired-accounts',
      {},
      { repeat: { pattern: '0 4 * * *' }, jobId: 'gdpr_accounts_cron' },
    );

    this.logger.log('Registered repeatable GDPR jobs.');
  }
}
