import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClickHouseLoadService,
  SELECT_TIMEOUT_MS,
} from '../warehouse/clickhouse-load.service.js';
import { writeCsvFile } from '../warehouse/utils/csv.util.js';
import {
  classifyFailure,
  csvRows,
  WarehouseReportService,
} from './warehouse-report.service.js';

let root: string;

function exportFolder(name: string, files: Record<string, string>) {
  const folder = path.join(root, name);
  fs.mkdirSync(folder, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(folder, file), content);
  }
}

function warehouseQueue(failedReason?: string, fail = false) {
  return {
    name: 'warehouse-export',
    getJobCounts: vi.fn(async () => {
      if (fail) throw new Error('redis down');
      return { completed: 12, failed: 1, delayed: 1 };
    }),
    getFailed: vi.fn(async () =>
      failedReason === undefined ? [] : [{ failedReason }],
    ),
  };
}

function setup({
  configured = true,
  select = vi.fn(async (query: string) => {
    if (query.includes('system.tables')) {
      return [
        { name: 'appeals', rows: '0', bytes: '0' },
        { name: 'transactions', rows: '42', bytes: '8192' },
        { name: 'schema_migrations', rows: 3, bytes: 100 },
      ];
    }
    if (query.includes('FROM transactions')) {
      return [{ newest: '2026-11-24 03:30:00' }];
    }
    return [{ newest: null }];
  }),
  queues = [warehouseQueue('ClickHouse insert into transactions failed (500)')],
}: {
  configured?: boolean;
  select?: ReturnType<typeof vi.fn>;
  queues?: object[];
} = {}) {
  return new WarehouseReportService(
    { isConfigured: () => configured, select } as never,
    { exportRoot: () => root } as never,
    queues as never,
  );
}

describe('WarehouseReportService', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-report-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('shows each table with its rows, size and newest row, and the backend side of the load', async () => {
    exportFolder('2026-11-21T03-30-00', { 'reports.csv': 'id\n1\n' });
    exportFolder('2026-11-22T03-30-00', { 'reports.csv': 'id\n' });
    exportFolder('2026-11-23T03-30-00', {
      'reports.csv': 'id,status\n1,OPEN\n2,OPEN\n',
      // A last row without its newline is still a row.
      'transactions.csv': 'id\na\nb\nc',
    });
    exportFolder('2026-11-24T03-30-00', { 'appeals.csv': 'id\nx\n' });
    // Not an export: left out.
    exportFolder('notes', { 'reports.csv': 'id\n1\n' });

    const report = await setup().report();

    expect(report.configured).toBe(true);
    expect(report.readError).toBeNull();
    expect(report.tables).toEqual([
      {
        name: 'appeals',
        rows: 0,
        bytes: 0,
        newestRowAt: null,
        newestRowUnknown: false,
      },
      {
        name: 'transactions',
        rows: 42,
        bytes: 8192,
        newestRowAt: '2026-11-24 03:30:00',
        newestRowUnknown: false,
      },
      // Not a table the export loads: no newest row is asked.
      {
        name: 'schema_migrations',
        rows: 3,
        bytes: 100,
        newestRowAt: null,
        newestRowUnknown: false,
      },
    ]);
    expect(report.exportFolder).toBe('writable');
    expect(report.recentExports).toEqual([
      { name: '2026-11-22T03-30-00', rows: { reports: 0 } },
      {
        name: '2026-11-23T03-30-00',
        rows: { reports: 2, transactions: 3 },
      },
      { name: '2026-11-24T03-30-00', rows: { appeals: 1 } },
    ]);
    expect(report.job).toEqual({
      completed: 12,
      failed: 1,
      scheduled: 1,
      lastFailure: 'load_failed',
    });
  });

  it('reads nothing of the warehouse when its address is not set', async () => {
    const select = vi.fn();
    fs.rmSync(root, { recursive: true, force: true });

    const report = await setup({
      configured: false,
      select,
      queues: [warehouseQueue()],
    }).report();

    expect(select).not.toHaveBeenCalled();
    expect(report.configured).toBe(false);
    expect(report.tables).toBeNull();
    expect(report.readError).toBeNull();
    expect(report.exportFolder).toBe('missing');
    expect(report.recentExports).toEqual([]);
    expect(report.job?.lastFailure).toBeNull();
  });

  it('says the warehouse could not be read, never why in its words', async () => {
    const report = await setup({
      select: vi.fn().mockRejectedValue(new Error('secret detail')),
      queues: [warehouseQueue(undefined, true)],
    }).report();

    expect(report.tables).toBeNull();
    expect(report.readError).toBe('unreachable');
    expect(report.job).toBeNull();
    expect(JSON.stringify(report)).not.toContain('secret');
  });

  it('leaves only that table unknown when its newest row cannot be read', async () => {
    const report = await setup({
      select: vi.fn(async (query: string) => {
        if (query.includes('system.tables')) {
          return [
            { name: 'reports', rows: 5, bytes: 10 },
            { name: 'transactions', rows: 7, bytes: 20 },
          ];
        }
        if (query.includes('FROM transactions')) {
          throw new Error('The operation was aborted due to timeout');
        }
        return [{ newest: '2026-11-24 01:00:00' }];
      }),
      queues: [],
    }).report();

    expect(report.readError).toBeNull();
    expect(report.tables).toEqual([
      {
        name: 'reports',
        rows: 5,
        bytes: 10,
        newestRowAt: '2026-11-24 01:00:00',
        newestRowUnknown: false,
      },
      {
        name: 'transactions',
        rows: 7,
        bytes: 20,
        newestRowAt: null,
        newestRowUnknown: true,
      },
    ]);
  });

  it('has no job line without the queue, and treats an unanswered query as no rows', async () => {
    const report = await setup({
      select: vi.fn().mockResolvedValue(null),
      queues: [],
    }).report();

    expect(report.tables).toEqual([]);
    expect(report.job).toBeNull();
  });

  it('says when the backend cannot write the export folder', async () => {
    const access = vi
      .spyOn(fs.promises, 'access')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('EACCES'));

    const report = await setup({ queues: [] }).report();

    expect(report.exportFolder).toBe('not_writable');
    access.mockRestore();
  });

  it('counts the records the export wrote, a line break inside a quoted field included', async () => {
    // The export's own writer, with a value that spans lines and quotes.
    await expect(
      writeCsvFile(
        root,
        'feature_flags',
        ['id', 'name'],
        [
          { id: 'f1', name: 'first\nsecond' },
          { id: 'f2', name: 'say "hi",\r\nthen go' },
          { id: 'f3', name: 'plain' },
        ],
      ),
    ).resolves.toBe(3);
    await expect(csvRows(path.join(root, 'feature_flags.csv'))).resolves.toBe(
      3,
    );

    const write = (name: string, content: string) => {
      fs.writeFileSync(path.join(root, name), content);
      return csvRows(path.join(root, name));
    };
    // A last record without its line break, and Windows line breaks.
    await expect(write('a.csv', 'id\r\n1\r\n2')).resolves.toBe(2);
    // Only the header, or nothing at all.
    await expect(write('b.csv', 'id\n')).resolves.toBe(0);
    await expect(write('c.csv', '')).resolves.toBe(0);
  });

  it('asks the warehouse for the newest row in UTC', async () => {
    const select = vi.fn(async (query: string) =>
      query.includes('system.tables')
        ? [{ name: 'reports', rows: 1, bytes: 1 }]
        : [{ newest: '2026-11-24 01:00:00' }],
    );
    await setup({ select, queues: [] }).report();

    expect(select).toHaveBeenCalledWith(
      "SELECT if(count() = 0, NULL, toString(max(updatedAt), 'UTC')) AS newest FROM reports",
    );
  });

  it('gives the kind of a failure, never its message', () => {
    expect(classifyFailure("EACCES: permission denied, open '/x'")).toBe(
      'export_folder_not_writable',
    );
    expect(classifyFailure('EPERM')).toBe('export_folder_not_writable');
    expect(classifyFailure('ENOENT: no such file')).toBe('path_missing');
    expect(classifyFailure('ClickHouse read failed (500)')).toBe('load_failed');
    expect(classifyFailure('PrismaClientKnownRequestError')).toBe(
      'database_read_failed',
    );
    expect(classifyFailure('Can not reach database server')).toBe(
      'database_read_failed',
    );
    expect(classifyFailure('boom')).toBe('other');
  });
});

describe('ClickHouseLoadService.select', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const config = (url?: string) =>
    ({
      get: (key: string) =>
        key === 'CLICKHOUSE_URL'
          ? url
          : key === 'CLICKHOUSE_DATABASE'
            ? undefined
            : undefined,
    }) as never;

  it('runs a read-only query with the credentials in a header, and answers its rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ name: 'reports' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new ClickHouseLoadService(
      config('http://reader:pw@clickhouse:8123'),
    );

    await expect(
      service.select('SELECT name FROM system.tables'),
    ).resolves.toEqual([{ name: 'reports' }]);

    const [address, init] = fetchMock.mock.calls[0];
    const url = new URL(address);
    expect(url.username).toBe('');
    expect(url.searchParams.get('readonly')).toBe('1');
    expect(url.searchParams.get('database')).toBe('circlesfera_analytics');
    expect(init.body).toBe('SELECT name FROM system.tables FORMAT JSON');
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('gives up on a warehouse that does not answer in time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(init.signal.reason),
            );
          }),
      ),
    );
    const service = new ClickHouseLoadService(config('http://clickhouse:8123'));

    await expect(service.select('SELECT 1', 20)).rejects.toThrow();
    expect(SELECT_TIMEOUT_MS).toBe(5_000);
  });

  it('answers null without an address, and no rows for an answer without data', async () => {
    await expect(
      new ClickHouseLoadService(config()).select('SELECT 1'),
    ).resolves.toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    await expect(
      new ClickHouseLoadService(config('http://clickhouse:8123')).select(
        'SELECT 1',
      ),
    ).resolves.toEqual([]);
  });
});
