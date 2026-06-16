import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class GdprCron {
  private readonly logger = new Logger(GdprCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
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

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
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
            const filePath = path.join(process.cwd(), 'uploads', 'exports', filename);
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

      this.logger.log(`Purged ${result.count} expired data export records and deleted ${deletedFiles} files.`);
    } catch (error) {
      this.logger.error('Failed to purge expired data exports', error);
    }
  }
}
