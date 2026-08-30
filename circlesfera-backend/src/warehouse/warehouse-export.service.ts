import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClickHouseLoadService } from './clickhouse-load.service.js';
import type {
  AnalyticsExportResult,
  ExportRowCounts,
} from './types/export.types.js';
import { writeCsvFile } from './utils/csv.util.js';

const REPORT_HEADERS = [
  'id',
  'status',
  'targetType',
  'createdAt',
  'updatedAt',
  'resolvedAt',
] as const;

const APPEAL_HEADERS = [
  'id',
  'status',
  'targetType',
  'createdAt',
  'updatedAt',
  'resolvedAt',
] as const;

const TICKET_HEADERS = [
  'id',
  'status',
  'createdAt',
  'updatedAt',
  'resolvedAt',
] as const;

const TRANSACTION_HEADERS = [
  'id',
  'type',
  'amount',
  'currency',
  'status',
  'senderId',
  'receiverId',
  'postId',
  'storyId',
  'promotionId',
  'liveStreamId',
  'createdAt',
] as const;

const FEATURE_FLAG_HEADERS = [
  'id',
  'key',
  'name',
  'isEnabled',
  'percentage',
  'createdAt',
  'updatedAt',
] as const;

@Injectable()
export class WarehouseExportService {
  private readonly logger = new Logger(WarehouseExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly clickHouseLoad: ClickHouseLoadService,
  ) {}

  async runNightlyExport(): Promise<AnalyticsExportResult> {
    const started = Date.now();
    const sinceDays = Number(this.config.get('ETL_SINCE_DAYS') ?? 1);
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const etlRoot =
      this.config.get<string>('ETL_DIR') ??
      join(process.cwd(), 'backups', 'etl');
    const outputDir = join(
      etlRoot,
      new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
    );

    const windowFilter = {
      OR: [
        { createdAt: { gte: since } },
        { updatedAt: { gte: since } },
        { resolvedAt: { gte: since } },
      ],
    } satisfies Prisma.ReportWhereInput;

    const [reports, appeals, tickets, transactions, featureFlags] =
      await Promise.all([
        this.prisma.report.findMany({
          where: windowFilter,
          select: {
            id: true,
            status: true,
            targetType: true,
            createdAt: true,
            updatedAt: true,
            resolvedAt: true,
          },
        }),
        this.prisma.appeal.findMany({
          where: windowFilter,
          select: {
            id: true,
            status: true,
            targetType: true,
            createdAt: true,
            updatedAt: true,
            resolvedAt: true,
          },
        }),
        this.prisma.supportTicket.findMany({
          where: windowFilter,
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            resolvedAt: true,
          },
        }),
        this.prisma.transaction.findMany({
          where: { createdAt: { gte: since } },
          select: {
            id: true,
            type: true,
            amount: true,
            currency: true,
            status: true,
            senderId: true,
            receiverId: true,
            postId: true,
            storyId: true,
            promotionId: true,
            liveStreamId: true,
            createdAt: true,
          },
        }),
        this.prisma.featureFlag.findMany({
          select: {
            id: true,
            key: true,
            name: true,
            isEnabled: true,
            percentage: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

    const rowCounts: ExportRowCounts = {
      reports: await writeCsvFile(
        outputDir,
        'reports',
        REPORT_HEADERS,
        reports,
      ),
      appeals: await writeCsvFile(
        outputDir,
        'appeals',
        APPEAL_HEADERS,
        appeals,
      ),
      support_tickets: await writeCsvFile(
        outputDir,
        'support_tickets',
        TICKET_HEADERS,
        tickets,
      ),
      transactions: await writeCsvFile(
        outputDir,
        'transactions',
        TRANSACTION_HEADERS,
        transactions,
      ),
      feature_flags: await writeCsvFile(
        outputDir,
        'feature_flags',
        FEATURE_FLAG_HEADERS,
        featureFlags,
      ),
    };

    const durationMs = Date.now() - started;
    this.logger.log(
      `Analytics export → ${outputDir} (${sinceDays}d window, ${durationMs}ms, rows=${JSON.stringify(rowCounts)})`,
    );

    const clickhouseLoaded = await this.clickHouseLoad.loadExportDirectory(
      outputDir,
      rowCounts,
    );

    return {
      outputDir,
      rowCounts,
      durationMs,
      clickhouseLoaded,
    };
  }
}
