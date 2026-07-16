import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

const require = createRequire(import.meta.url);
const archiver = require('archiver');

@Processor('users-processing')
export class GdprProcessor extends WorkerHost {
  private readonly logger = new Logger(GdprProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'export-data':
        return this.processDataExport(job.data.requestId, job.data.userId);
      case 'clean-expired-search-history':
        return this.cleanExpiredSearchHistory();
      case 'clean-expired-data-exports':
        return this.cleanExpiredDataExports();
      case 'clean-expired-accounts':
        return this.cleanExpiredAccounts();
      case 'hard-delete-user':
        return this.hardDeleteUser(job.data.userId);
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

  async hardDeleteUser(userId: string) {
    this.logger.log(`Executing hard delete for user ${userId}`);
    try {
      await this.usersService.deleteUser(userId);
      this.logger.log(`Successfully hard deleted user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to hard delete user ${userId}`, error);
      throw error;
    }
  }

  private async processDataExport(requestId: string, userId: string) {
    await this.prisma.dataExportRequest.update({
      where: { id: requestId },
      data: { status: 'PROCESSING' },
    });

    try {
      const userData = await this.usersService.exportUserData(userId);

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          profile: { select: { fullName: true, username: true } },
        },
      });

      if (!user) throw new Error('User not found');

      // Ensure uploads/exports directory exists
      const exportsDir = path.join(process.cwd(), 'uploads', 'exports');
      if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
      }

      const fileName = `export_${userId}_${Date.now()}.zip`;
      const filePath = path.join(exportsDir, fileName);

      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      return new Promise<void>((resolve, reject) => {
        output.on('close', async () => {
          try {
            const backendUrl =
              this.configService.get('BACKEND_URL') || 'http://localhost:3000';
            const downloadUrl = `${backendUrl}/uploads/exports/${fileName}`;

            // Update request status
            await this.prisma.dataExportRequest.update({
              where: { id: requestId },
              data: {
                status: 'COMPLETED',
                url: downloadUrl,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
              },
            });

            // Send email
            const name =
              user.profile?.fullName || user.profile?.username || 'User';
            await this.emailService.sendBroadcastEmail(
              user.email,
              'Your Data Export is Ready',
              `Hello ${name}`,
              'Your requested data export is now ready to download. For security reasons, this link will expire in 7 days.',
              'Download My Data',
              downloadUrl,
            );

            this.logger.log(
              `Export completed for user ${userId}. Saved to ${filePath}`,
            );
            resolve();
          } catch (e) {
            reject(e);
          }
        });

        archive.on('error', (err: any) => {
          reject(err);
        });

        archive.pipe(output);

        // Add user data JSON
        archive.append(JSON.stringify(userData, null, 2), {
          name: 'user_data.json',
        });

        // Add some instructions
        archive.append(
          'This archive contains all your personal data as per GDPR compliance.\n\n- user_data.json: Your profile, posts, comments, likes, and settings.',
          { name: 'README.txt' },
        );

        archive.finalize();
      });
    } catch (error) {
      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: { status: 'FAILED' },
      });
      this.logger.error(`Export failed for user ${userId}`, error);
      throw error;
    }
  }
}
