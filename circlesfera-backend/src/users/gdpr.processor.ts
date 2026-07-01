import * as fs from 'node:fs';
import * as path from 'node:path';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';

@Processor('users-processing')
export class GdprProcessor extends WorkerHost {
  private readonly logger = new Logger(GdprProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'clean-expired-search-history':
        return this.cleanExpiredSearchHistory();
      case 'clean-expired-data-exports':
        return this.cleanExpiredDataExports();
      case 'clean-expired-accounts':
        return this.cleanExpiredAccounts();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  async cleanExpiredSearchHistory() {
    this.logger.log('Starting daily purge of expired SearchHistory...');
    try {
      const result = await this.prisma.searchHistory.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
      this.logger.log(`Purged ${result.count} expired search history records.`);
    } catch (error) {
      this.logger.error('Failed to purge expired search history', error);
    }
  }

  async cleanExpiredDataExports() {
    this.logger.log('Starting daily purge of expired Data Exports...');
    try {
      const expiredRequests = await this.prisma.dataExportRequest.findMany({
        where: {
          status: 'COMPLETED',
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      let deletedFiles = 0;
      for (const req of expiredRequests) {
        if (req.url) {
          // url format is usually /uploads/exports/filename.zip
          // We need to extract the filename to delete it locally
          const filename = req.url.split('/').pop();
          if (filename) {
            const filePath = path.join(
              process.cwd(),
              'uploads',
              'exports',
              filename,
            );
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              deletedFiles++;
            }
          }
        }
      }

      const result = await this.prisma.dataExportRequest.deleteMany({
        where: {
          status: 'COMPLETED',
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      this.logger.log(
        `Purged ${result.count} expired data export records and deleted ${deletedFiles} files.`,
      );
    } catch (error) {
      this.logger.error('Failed to purge expired data exports', error);
    }
  }

  async cleanExpiredAccounts() {
    this.logger.log('Starting daily purge of expired Accounts...');
    try {
      const expiredUsers = await this.prisma.user.findMany({
        where: {
          deletedAt: {
            lt: new Date(),
          },
        },
      });

      let deletedCount = 0;
      for (const user of expiredUsers) {
        await this.prisma.user.delete({
          where: { id: user.id },
        });
        deletedCount++;
      }

      this.logger.log(`Purged ${deletedCount} expired user accounts.`);
    } catch (error) {
      this.logger.error('Failed to purge expired accounts', error);
    }
  }
}
