import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Job, UnrecoverableError } from 'bullmq';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EXPORTS_DIR, LEGACY_EXPORTS_DIR } from './data-export.constants.js';
import { DataExportService } from './data-export.service.js';
import { UsersService } from './users.service.js';

const require = createRequire(import.meta.url);
const archiver = require('archiver');

@Injectable()
export class DataExportProcessor extends WorkerHost {
  private readonly logger = new Logger(DataExportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly dataExportService: DataExportService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'export-data':
        return this.processDataExport(
          job.data?.requestId,
          job.data?.userId,
          job,
        );
      case 'clean-expired-data-exports':
        return this.cleanExpiredDataExports();
      default:
        throw new UnrecoverableError(
          `Unknown job name in DataExportProcessor: ${job.name}`,
        );
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
        // Check opaque filename in EXPORTS_DIR
        const opaqueName = `export_${req.id}.zip`;
        const primaryPath = path.join(EXPORTS_DIR, opaqueName);
        if (fs.existsSync(primaryPath)) {
          fs.unlinkSync(primaryPath);
          deletedFiles++;
        }

        // Check legacy predictable name with userId
        const legacyPredictableName = `export_${req.userId}_${req.id}.zip`;
        const legacyPredictablePath = path.join(
          EXPORTS_DIR,
          legacyPredictableName,
        );
        if (fs.existsSync(legacyPredictablePath)) {
          fs.unlinkSync(legacyPredictablePath);
          deletedFiles++;
        }

        // Check if legacy URL had specific filename
        if (req.url) {
          const filename = path.basename(req.url.split('?')[0]);
          if (filename?.endsWith('.zip')) {
            const legacyPath = path.join(LEGACY_EXPORTS_DIR, filename);
            if (fs.existsSync(legacyPath)) {
              fs.unlinkSync(legacyPath);
              deletedFiles++;
            }
            const fallbackPath = path.join(EXPORTS_DIR, filename);
            if (fs.existsSync(fallbackPath) && fallbackPath !== primaryPath) {
              fs.unlinkSync(fallbackPath);
              deletedFiles++;
            }
          }
        }
      }

      // Also clean any orphaned zip files older than 7 days in both dirs
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const dir of [EXPORTS_DIR, LEGACY_EXPORTS_DIR]) {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            if (file.endsWith('.zip')) {
              const fullPath = path.join(dir, file);
              try {
                const stat = fs.statSync(fullPath);
                if (stat.mtimeMs < cutoff) {
                  fs.unlinkSync(fullPath);
                  deletedFiles++;
                }
              } catch (e) {
                this.logger.warn(`Could not stat/unlink ${fullPath}: ${e}`);
              }
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
      return { count: result.count, deletedFiles };
    } catch (error) {
      this.logger.error('Failed to purge expired data exports', error);
      throw error;
    }
  }

  async processDataExport(
    requestId: string,
    userId: string,
    job?: Job<any, any, string>,
  ) {
    if (!requestId || !userId) {
      throw new UnrecoverableError(
        'Missing requestId or userId for data export',
      );
    }

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
          profiles: { take: 1, select: { fullName: true, username: true } },
        },
      });

      if (!user) {
        await this.prisma.dataExportRequest.update({
          where: { id: requestId },
          data: { status: 'FAILED' },
        });
        throw new UnrecoverableError(`User not found: ${userId}`);
      }

      if (!fs.existsSync(EXPORTS_DIR)) {
        fs.mkdirSync(EXPORTS_DIR, { recursive: true });
      }

      // Opaque non-identifying artifact name without user identifiers
      const fileName = `export_${requestId}.zip`;
      const filePath = path.join(EXPORTS_DIR, fileName);

      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      return new Promise<void>((resolve, reject) => {
        output.on('close', async () => {
          try {
            const backendUrl =
              this.configService.get('BACKEND_URL') || 'http://localhost:3000';
            const downloadUrl = `${backendUrl}/api/v1/users/gdpr/exports/${requestId}/download`;
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            await this.prisma.dataExportRequest.update({
              where: { id: requestId },
              data: {
                status: 'COMPLETED',
                url: downloadUrl,
                expiresAt,
              },
            });

            const downloadToken = this.dataExportService.generateDownloadToken(
              userId,
              requestId,
              expiresAt,
            );
            const emailDownloadUrl = `${downloadUrl}?token=${downloadToken}`;

            const name =
              user.profiles[0]?.fullName ||
              user.profiles[0]?.username ||
              'User';
            await this.emailService.sendBroadcastEmail(
              user.email,
              'Your Data Export is Ready',
              `Hello ${name}`,
              'Your requested data export is now ready to download. For security reasons, this link will expire in 7 days.',
              'Download My Data',
              emailDownloadUrl,
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

        archive.append(JSON.stringify(userData, null, 2), {
          name: 'user_data.json',
        });

        archive.append(
          'This archive contains all your personal data as per GDPR compliance.\n\n- user_data.json: Your profile, posts, comments, likes, and settings.',
          { name: 'README.txt' },
        );

        archive.finalize();
      });
    } catch (error) {
      const isTerminal =
        error instanceof UnrecoverableError ||
        (job && job.attemptsMade + 1 >= (job.opts?.attempts ?? 1));
      if (isTerminal) {
        await this.prisma.dataExportRequest
          .update({
            where: { id: requestId },
            data: { status: 'FAILED' },
          })
          .catch(() => {});
      }
      this.logger.error(`Export failed for user ${userId}`, error);
      throw error;
    }
  }
}
