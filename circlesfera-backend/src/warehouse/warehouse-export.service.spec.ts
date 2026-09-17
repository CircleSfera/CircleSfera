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
    get: vi.fn((key: string): string | undefined => {
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
    config.get.mockImplementation((key: string): string | undefined => {
      if (key === 'ETL_DIR') return dir;
      if (key === 'ETL_SINCE_DAYS') return '1';
      return undefined;
    });

    // Provide records with quotes, commas, newlines to exercise csv escaping
    prisma.appeal.findMany.mockResolvedValue([
      {
        id: 'a1',
        status: 'PENDING',
        reason: 'Violation, "quoted text"\nwith newline',
        createdAt: new Date('2026-08-01T10:00:00Z'),
        updatedAt: null,
      },
    ]);
    prisma.supportTicket.findMany.mockResolvedValue([
      {
        id: 'st1',
        subject: 'Help me',
        createdAt: new Date('2026-08-01T10:00:00Z'),
        updatedAt: new Date('2026-08-01T10:00:00Z'),
      },
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'tx1',
        amount: 100,
        createdAt: new Date('2026-08-01T10:00:00Z'),
      },
    ]);

    prisma.featureFlag.findMany.mockResolvedValue([
      {
        id: 'f1',
        key: 'feed_home_following_first',
        name: 'Feed test, "quoted"\nwith newline',
        isEnabled: false,
        percentage: 0,
        createdAt: new Date('2026-08-01T00:00:00Z'),
        updatedAt: new Date('2026-08-01T00:00:00Z'),
      },
    ]);

    const result = await service.runNightlyExport();

    expect(result.rowCounts.reports).toBe(1);
    expect(result.rowCounts.appeals).toBe(1);
    expect(result.rowCounts.support_tickets).toBe(1);
    expect(result.rowCounts.transactions).toBe(1);
    expect(result.rowCounts.feature_flags).toBe(1);
    expect(result.clickhouseLoaded).toBe(false);
    expect(clickHouseLoad.loadExportDirectory).toHaveBeenCalledOnce();

    const flagsCsv = await readFile(
      join(result.outputDir, 'feature_flags.csv'),
      'utf8',
    );
    expect(flagsCsv).toContain('Feed test, ""quoted""\nwith newline');
  });

  it('handles default configuration values when ETL_DIR and ETL_SINCE_DAYS are omitted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'csf-etl-fallback-'));
    // Return undefined to trigger fallback operators
    config.get.mockImplementation((key: string): string | undefined => {
      if (key === 'ETL_DIR') return dir;
      return undefined;
    });

    const result = await service.runNightlyExport();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('ClickHouseLoadService', () => {
  it('skips load when CLICKHOUSE_URL is unset and checks isConfigured', async () => {
    const config = {
      get: vi.fn().mockReturnValue(undefined),
    };
    const service = new ClickHouseLoadService(
      config as unknown as ConfigService,
    );
    expect(service.isConfigured()).toBe(false);

    const loaded = await service.loadExportDirectory('/tmp/x', {
      reports: 1,
      appeals: 0,
      support_tickets: 0,
      transactions: 0,
      feature_flags: 0,
    });
    expect(loaded).toBe(false);
  });

  it('loads tables with basic auth when configured and handles ok responses', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'csf-ch-'));
    const { writeCsvFile } = await import('./utils/csv.util.js');
    await writeCsvFile(
      dir,
      'reports',
      ['id', 'status'],
      [{ id: 'r1', status: 'RESOLVED' }],
    );

    const config = {
      get: vi.fn((key: string) => {
        if (key === 'CLICKHOUSE_URL')
          return 'http://default:secret@clickhouse.internal:8123';
        if (key === 'CLICKHOUSE_DATABASE') return 'custom_db';
        return null;
      }),
    };
    const service = new ClickHouseLoadService(
      config as unknown as ConfigService,
    );
    expect(service.isConfigured()).toBe(true);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const loaded = await service.loadExportDirectory(dir, {
      reports: 1,
      appeals: 0,
      support_tickets: 0,
      transactions: 0,
      feature_flags: 0,
    });

    expect(loaded).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('custom_db'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'text/csv',
          Authorization: expect.stringContaining('Basic '),
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('throws error when ClickHouse insert fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'csf-ch-fail-'));
    const { writeCsvFile } = await import('./utils/csv.util.js');
    await writeCsvFile(dir, 'reports', ['id'], [{ id: 'r1' }]);

    const config = {
      get: vi.fn((key: string) => {
        if (key === 'CLICKHOUSE_URL') return 'http://clickhouse.internal:8123';
        return null;
      }),
    };
    const service = new ClickHouseLoadService(
      config as unknown as ConfigService,
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Table does not exist'),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      service.loadExportDirectory(dir, {
        reports: 1,
        appeals: 0,
        support_tickets: 0,
        transactions: 0,
        feature_flags: 0,
      }),
    ).rejects.toThrow('ClickHouse insert into reports failed (500)');

    vi.unstubAllGlobals();
  });
});

describe('WarehouseExportProcessor', () => {
  it('processes nightly-analytics-export job', async () => {
    const { WarehouseExportProcessor } = await import(
      './processors/warehouse-export.processor.js'
    );
    const mockExportService = {
      runNightlyExport: vi.fn().mockResolvedValue({
        durationMs: 120,
        clickhouseLoaded: true,
      }),
    };

    const processor = new WarehouseExportProcessor(
      mockExportService as unknown as WarehouseExportService,
    );

    await processor.process({ name: 'nightly-analytics-export' } as any);
    expect(mockExportService.runNightlyExport).toHaveBeenCalledOnce();
  });

  it('throws UnrecoverableError for unknown job names', async () => {
    const { WarehouseExportProcessor } = await import(
      './processors/warehouse-export.processor.js'
    );
    const { UnrecoverableError } = await import('bullmq');
    const mockExportService = {
      runNightlyExport: vi.fn(),
    };

    const processor = new WarehouseExportProcessor(
      mockExportService as unknown as WarehouseExportService,
    );

    await expect(
      processor.process({ name: 'unknown-job' } as any),
    ).rejects.toThrow(UnrecoverableError);
  });
});
