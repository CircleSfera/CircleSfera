import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClickHouseLoadService,
  RETIRED_PAYMENT_COLUMNS,
} from './clickhouse-load.service.js';
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
      { ticketFactsSince: prisma.supportTicket.findMany } as never,
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
        senderId: 'u-payer',
        promotionId: 'promo-1',
        vatCents: 17,
        refundedCents: 40,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        updatedAt: new Date('2026-08-03T10:00:00Z'),
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

    // Each payment names the person who paid and what it paid for, and
    // nothing of the former payments to creators.
    const [header, row] = (
      await readFile(join(result.outputDir, 'transactions.csv'), 'utf8')
    ).split('\n');
    const columns = header.split(',').map((c) => c.replaceAll('"', ''));
    const cells = row.split(',').map((c) => c.replaceAll('"', ''));
    expect(columns).toEqual([
      'id',
      'type',
      'amount',
      'vatCents',
      'refundedCents',
      'currency',
      'status',
      'senderId',
      'promotionId',
      'createdAt',
      'updatedAt',
    ]);
    expect(cells[columns.indexOf('senderId')]).toBe('u-payer');
    expect(cells[columns.indexOf('promotionId')]).toBe('promo-1');
    // What was VAT and what went back to the buyer, and when it last changed.
    expect(cells[columns.indexOf('vatCents')]).toBe('17');
    expect(cells[columns.indexOf('refundedCents')]).toBe('40');
    expect(cells[columns.indexOf('updatedAt')]).toBe(
      '2026-08-03T10:00:00.000Z',
    );
  });

  it('takes again a payment that changed since the last run, not only a new one', async () => {
    await service.runNightlyExport();

    const { where } = prisma.transaction.findMany.mock.calls[0][0];
    expect(where.OR).toEqual([
      { createdAt: { gte: expect.any(Date) } },
      { updatedAt: { gte: expect.any(Date) } },
    ]);
  });

  describe('keeping the nightly CSVs no longer than the retention', () => {
    const exportAt = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
    const withDir = (dir: string, retention?: string) =>
      config.get.mockImplementation((key: string): string | undefined => {
        if (key === 'ETL_DIR') return dir;
        if (key === 'ETL_RETENTION_DAYS') return retention;
        return undefined;
      });

    it('removes exports older than seven days, and keeps recent ones and anything else', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'csf-etl-keep-'));
      const old = exportAt(8);
      const recent = exportAt(2);
      for (const name of [old, recent, 'notes']) {
        await mkdir(join(dir, name), { recursive: true });
      }
      await writeFile(join(dir, old, 'transactions.csv'), 'id\n');
      await writeFile(join(dir, 'README.txt'), 'kept');
      withDir(dir);

      await service.runNightlyExport();

      const left = await readdir(dir);
      expect(left).not.toContain(old);
      expect(left).toEqual(
        expect.arrayContaining([recent, 'notes', 'README.txt']),
      );
    });

    it('leaves a folder whose name only looks like a date', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'csf-etl-keep4-'));
      for (const name of ['2020-13-45T99-99-99', '2020-02-30T00-00-00']) {
        await mkdir(join(dir, name), { recursive: true });
      }
      withDir(dir);

      await service.runNightlyExport();

      // 30 February would be read as 1 March.
      expect(await readdir(dir)).toEqual(
        expect.arrayContaining(['2020-13-45T99-99-99', '2020-02-30T00-00-00']),
      );
    });

    it('removes old exports even when the ClickHouse load fails, and still reports that failure', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'csf-etl-keep5-'));
      const old = exportAt(9);
      await mkdir(join(dir, old), { recursive: true });
      withDir(dir);
      clickHouseLoad.loadExportDirectory.mockRejectedValueOnce(
        new Error('ClickHouse down'),
      );

      await expect(service.runNightlyExport()).rejects.toThrow(
        'ClickHouse down',
      );

      expect(await readdir(dir)).not.toContain(old);
    });

    it('never fails the export, so never loads it twice, when old exports cannot be removed', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'csf-etl-keep6-'));
      withDir(dir);
      const removing = vi
        .spyOn(service as any, 'removeExportsOlderThanRetention')
        .mockRejectedValueOnce(new Error('disk'));

      await expect(service.runNightlyExport()).resolves.toMatchObject({
        outputDir: expect.any(String),
      });
      expect(removing).toHaveBeenCalled();
    });

    it('follows ETL_RETENTION_DAYS', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'csf-etl-keep2-'));
      const threeDays = exportAt(3);
      await mkdir(join(dir, threeDays), { recursive: true });
      withDir(dir, '2');

      await service.runNightlyExport();

      expect(await readdir(dir)).not.toContain(threeDays);
    });

    it('removes nothing with a retention that is not a number of days', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'csf-etl-keep3-'));
      const old = exportAt(30);
      await mkdir(join(dir, old), { recursive: true });
      withDir(dir, 'zero');

      await service.runNightlyExport();

      expect(await readdir(dir)).toContain(old);
    });
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
    // Values go by the names of the header: a column the export gained
    // before the table did is left out, and one the table has that the
    // export does not carry takes its default.
    const insert = new URL(fetchMock.mock.calls[0][0]).searchParams;
    expect(insert.get('query')).toBe('INSERT INTO reports FORMAT CSVWithNames');
    expect(insert.get('input_format_with_names_use_header')).toBe('1');
    expect(insert.get('input_format_defaults_for_omitted_fields')).toBe('1');
    expect(insert.get('input_format_skip_unknown_fields')).toBe('1');
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

  it('drops the columns of the former payments to creators before loading payments', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ch-retired-'));
    await writeFile(
      join(dir, 'transactions.csv'),
      'id,type\n"t1","STRIPE_SUBSCRIPTION"\n',
    );
    const service = new ClickHouseLoadService({
      get: vi.fn((key: string) =>
        key === 'CLICKHOUSE_URL' ? 'http://clickhouse:8123' : null,
      ),
    } as unknown as ConfigService);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await service.loadExportDirectory(dir, {
      reports: 0,
      appeals: 0,
      support_tickets: 0,
      transactions: 1,
      feature_flags: 0,
    });

    const [drop, insert] = fetchMock.mock.calls.map(([address]) =>
      new URL(address).searchParams.get('query'),
    );
    expect(drop).toBe(
      `ALTER TABLE transactions ${RETIRED_PAYMENT_COLUMNS.map((c) => `DROP COLUMN IF EXISTS ${c}`).join(', ')}`,
    );
    expect(drop).toContain('DROP COLUMN IF EXISTS receiverId');
    expect(insert).toBe('INSERT INTO transactions FORMAT CSVWithNames');
    vi.unstubAllGlobals();
  });

  describe("erasing a person's rows", () => {
    const withUrl = (url?: string) =>
      new ClickHouseLoadService({
        get: vi.fn((key: string) =>
          key === 'CLICKHOUSE_URL' ? url : undefined,
        ),
      } as unknown as ConfigService);
    const erased = {
      userId: 'u-1',
      profileIds: ['p-1', 'p-2'],
      mediaUrls: [],
    } as never;

    afterEach(() => vi.unstubAllGlobals());

    it('deletes every payment the person paid', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', fetchMock);

      await withUrl('http://circlesfera:pw@clickhouse:8123').eraseUser(erased);

      const [address, init] = fetchMock.mock.calls[0];
      const url = new URL(address);
      expect(url.searchParams.get('query')).toBe(
        'ALTER TABLE transactions DELETE WHERE senderId IN {ids:Array(String)}',
      );
      expect(url.searchParams.get('param_ids')).toBe("['u-1']");
      expect(url.searchParams.get('database')).toBe('circlesfera_analytics');
      // The password goes in a header, never in the address.
      expect(url.password).toBe('');
      expect(init.headers.Authorization).toBe(
        `Basic ${Buffer.from('circlesfera:pw').toString('base64')}`,
      );
    });

    it('asks nothing when the warehouse is not set up', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await withUrl(undefined).eraseUser(erased);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never stops the erasure when the warehouse fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve('boom'),
        }),
      );

      await expect(
        withUrl('http://clickhouse:8123').eraseUser(erased),
      ).resolves.toBeUndefined();
    });
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
