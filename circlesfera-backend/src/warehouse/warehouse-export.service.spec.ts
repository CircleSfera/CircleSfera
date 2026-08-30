import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClickHouseLoadService } from './clickhouse-load.service.js';
import { WarehouseExportService } from './warehouse-export.service.js';

describe('WarehouseExportService', () => {
  const prisma = {
    report: { findMany: vi.fn() },
    appeal: { findMany: vi.fn() },
    supportTicket: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
    featureFlag: { findMany: vi.fn() },
  };

  const clickHouseLoad = {
    loadExportDirectory: vi.fn().mockResolvedValue(false),
  };

  const config = {
    get: vi.fn((key: string) => {
      if (key === 'ETL_SINCE_DAYS') return '1';
      if (key === 'ETL_DIR') return undefined;
      return undefined;
    }),
  };

  let service: WarehouseExportService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.report.findMany.mockResolvedValue([
      {
        id: 'r1',
        status: 'RESOLVED',
        targetType: 'POST',
        createdAt: new Date('2026-08-01T10:00:00Z'),
        updatedAt: new Date('2026-08-01T11:00:00Z'),
        resolvedAt: new Date('2026-08-01T11:00:00Z'),
      },
    ]);
    prisma.appeal.findMany.mockResolvedValue([]);
    prisma.supportTicket.findMany.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.featureFlag.findMany.mockResolvedValue([
      {
        id: 'f1',
        key: 'feed_home_following_first',
        name: 'Feed test',
        isEnabled: false,
        percentage: 0,
        createdAt: new Date('2026-08-01T00:00:00Z'),
        updatedAt: new Date('2026-08-01T00:00:00Z'),
      },
    ]);

    service = new WarehouseExportService(
      prisma as never,
      config as unknown as ConfigService,
      clickHouseLoad as unknown as ClickHouseLoadService,
    );
  });

  it('writes CSV snapshots and delegates optional ClickHouse load', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'csf-etl-'));
    config.get.mockImplementation((key: string) => {
      if (key === 'ETL_DIR') return dir;
      if (key === 'ETL_SINCE_DAYS') return '1';
      return undefined;
    });

    const result = await service.runNightlyExport();

    expect(result.rowCounts.reports).toBe(1);
    expect(result.rowCounts.feature_flags).toBe(1);
    expect(result.clickhouseLoaded).toBe(false);
    expect(clickHouseLoad.loadExportDirectory).toHaveBeenCalledOnce();

    const reportsCsv = await readFile(
      join(result.outputDir, 'reports.csv'),
      'utf8',
    );
    expect(reportsCsv).toContain('r1');
    expect(reportsCsv).toContain('RESOLVED');
  });
});

describe('ClickHouseLoadService', () => {
  it('skips load when CLICKHOUSE_URL is unset', async () => {
    const config = {
      get: vi.fn().mockReturnValue(undefined),
    };
    const service = new ClickHouseLoadService(
      config as unknown as ConfigService,
    );
    const loaded = await service.loadExportDirectory('/tmp/x', {
      reports: 1,
      appeals: 0,
      support_tickets: 0,
      transactions: 0,
      feature_flags: 0,
    });
    expect(loaded).toBe(false);
  });
});
