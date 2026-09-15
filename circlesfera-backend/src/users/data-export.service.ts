import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EXPORTS_DIR, LEGACY_EXPORTS_DIR } from './data-export.constants.js';

export const MAX_DAILY_DATA_EXPORTS = 3;

@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
  ) {}

  async requestDataExport(userId: string) {
    // 1. Check if user already has an active export in progress (admission control)
    const existingActive = await this.prisma.dataExportRequest.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    if (existingActive) {
      this.logger.warn(
        `Data export rejected for user ${userId}: existing request ${existingActive.id} is ${existingActive.status}`,
      );
      throw new ConflictException(
        'A data export request is already in progress for this account.',
      );
    }

    // 2. Check 24-hour quota (maximum 3 requests per 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await this.prisma.dataExportRequest.count({
      where: {
        userId,
        createdAt: { gte: oneDayAgo },
      },
    });

    if (recentCount >= MAX_DAILY_DATA_EXPORTS) {
      this.logger.warn(
        `Data export rejected for user ${userId}: daily quota exceeded (${recentCount}/${MAX_DAILY_DATA_EXPORTS})`,
      );
      throw new HttpException(
        `Daily data export limit reached (maximum ${MAX_DAILY_DATA_EXPORTS} requests per 24 hours).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Atomically persist tracking request and durable outbox event inside a transaction
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dataExportRequest.create({
        data: {
          userId,
          status: 'PENDING',
        },
      });

      await this.outboxService.enqueue(tx, {
        queueName: 'users-processing',
        eventName: 'export-data',
        payload: {
          requestId: created.id,
          userId,
        },
        options: {
          jobId: `export:${created.id}`,
          removeOnComplete: true,
          removeOnFail: false,
        },
      });

      return created;
    });

    // 4. Trigger immediate publish for sub-second delivery while ensuring crash recovery durability
    this.outboxService.triggerImmediatePublish();

    return {
      message: 'Data export request has been queued.',
      requestId: request.id,
    };
  }

  async getExportHistory(userId: string) {
    return this.prisma.dataExportRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  generateDownloadToken(
    userId: string,
    requestId: string,
    expiresAt: Date,
  ): string {
    const secret =
      this.configService.get<string>('JWT_SECRET') ||
      this.configService.get<string>('DATA_EXPORT_SECRET') ||
      'circlesfera-gdpr-export-secret';
    const payloadObj = {
      userId,
      requestId,
      exp: expiresAt.getTime(),
    };
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString(
      'base64url',
    );
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }

  verifyDownloadToken(
    token: string,
  ): { userId: string; requestId: string } | null {
    if (!token || typeof token !== 'string') {
      return null;
    }
    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }
    const [payload, signature] = parts;
    const secret =
      this.configService.get<string>('JWT_SECRET') ||
      this.configService.get<string>('DATA_EXPORT_SECRET') ||
      'circlesfera-gdpr-export-secret';
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      return null;
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      );
      if (!decoded.userId || !decoded.requestId || !decoded.exp) {
        return null;
      }
      if (Date.now() > decoded.exp) {
        return null;
      }
      return { userId: decoded.userId, requestId: decoded.requestId };
    } catch {
      return null;
    }
  }

  async streamDataExport(
    id: string,
    requesterUserId: string | undefined,
    token: string | undefined,
    res: Response,
  ): Promise<void> {
    const exportRequest = await this.prisma.dataExportRequest.findUnique({
      where: { id },
    });

    if (!exportRequest) {
      throw new NotFoundException('Data export request not found');
    }

    if (
      exportRequest.status === 'PENDING' ||
      exportRequest.status === 'PROCESSING'
    ) {
      throw new BadRequestException(
        'Data export is still processing. Please try again later.',
      );
    }

    if (exportRequest.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Data export is not available or has failed.',
      );
    }

    // Check expiration against record expiresAt
    if (
      exportRequest.expiresAt &&
      exportRequest.expiresAt.getTime() < Date.now()
    ) {
      throw new HttpException(
        'Export download link has expired.',
        HttpStatus.GONE,
      );
    }

    // Authorization check:
    // 1. If valid download token provided:
    let authorized = false;
    if (token) {
      const verified = this.verifyDownloadToken(token);
      if (!verified) {
        throw new ForbiddenException('Invalid or expired download token.');
      }
      if (
        verified.userId !== exportRequest.userId ||
        verified.requestId !== exportRequest.id
      ) {
        throw new ForbiddenException(
          'Download token does not match requested export.',
        );
      }
      authorized = true;
    }

    // 2. If authenticated user provided via session:
    if (requesterUserId) {
      if (requesterUserId === exportRequest.userId) {
        authorized = true;
      } else if (!authorized) {
        throw new ForbiddenException(
          'You are not authorized to access this data export.',
        );
      }
    }

    // 3. If neither or not authorized:
    if (!authorized) {
      if (!requesterUserId && !token) {
        throw new UnauthorizedException(
          'Authentication or valid download token required.',
        );
      }
      throw new ForbiddenException(
        'You are not authorized to access this data export.',
      );
    }

    // Locate file on disk with opaque naming
    let filename: string | null = null;
    if (exportRequest.url) {
      filename = path.basename(exportRequest.url.split('?')[0]);
    }
    if (!filename?.endsWith('.zip')) {
      filename = `export_${exportRequest.id}.zip`;
    }

    let filePath = path.join(EXPORTS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      const opaquePath = path.join(
        EXPORTS_DIR,
        `export_${exportRequest.id}.zip`,
      );
      if (fs.existsSync(opaquePath)) {
        filePath = opaquePath;
      } else {
        const predictableLegacyPath = path.join(
          EXPORTS_DIR,
          `export_${exportRequest.userId}_${exportRequest.id}.zip`,
        );
        if (fs.existsSync(predictableLegacyPath)) {
          filePath = predictableLegacyPath;
        } else {
          const legacyPath = path.join(LEGACY_EXPORTS_DIR, filename);
          if (fs.existsSync(legacyPath)) {
            filePath = legacyPath;
          } else {
            this.logger.error(`Export file missing from disk: ${filePath}`);
            throw new NotFoundException(
              'Export archive file not found on server.',
            );
          }
        }
      }
    }

    const downloadFileName = `export_${exportRequest.id}.zip`;
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadFileName}"`,
    );
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');

    return new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(filePath);
      readStream.on('error', (err) => {
        this.logger.error(
          `Error reading export file ${filePath}: ${err.message}`,
        );
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to stream export archive' });
        }
        reject(err);
      });
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      readStream.pipe(res);
    });
  }
}
