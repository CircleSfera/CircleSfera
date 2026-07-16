import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DataExportService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('users-processing') private readonly usersQueue: Queue,
  ) {}

  async requestDataExport(userId: string) {
    // 1. Create a tracking request
    const request = await this.prisma.dataExportRequest.create({
      data: {
        userId,
        status: 'PENDING',
      },
    });

    // 2. Start the export process asynchronously via BullMQ
    await this.usersQueue.add('export-data', {
      requestId: request.id,
      userId,
    });

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

  // The processDataExport logic has been moved to GdprProcessor
}
