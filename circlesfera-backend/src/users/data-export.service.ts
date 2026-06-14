import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const require = createRequire(import.meta.url);
const archiver = require('archiver');
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {}

  async requestDataExport(userId: string) {
    // 1. Create a tracking request
    const request = await this.prisma.dataExportRequest.create({
      data: {
        userId,
        status: 'PENDING',
      },
    });

    // 2. Start the export process asynchronously so we don't block the request
    this.processDataExport(request.id, userId).catch((error) => {
      this.logger.error(`Failed to process export ${request.id}`, error);
    });

    return {
      message: 'Data export request has been queued.',
      requestId: request.id,
    };
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

      output.on('close', async () => {
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
        const name = user.profile?.fullName || user.profile?.username || 'User';
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
      });

      archive.on('error', (err: any) => {
        throw err;
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

      await archive.finalize();
    } catch (error) {
      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: { status: 'FAILED' },
      });
      this.logger.error(`Export failed for user ${userId}`, error);
    }
  }
}
