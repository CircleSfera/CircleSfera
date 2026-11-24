import * as fs from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../common/constants/queue-policy.constants.js';
import { ClickHouseLoadService } from '../warehouse/clickhouse-load.service.js';
import type { ExportTableName } from '../warehouse/types/export.types.js';
import {
  EXPORT_FOLDER,
  WarehouseExportService,
} from '../warehouse/warehouse-export.service.js';
import { OPERATIONS_QUEUES } from './server-resources.service.js';

/** The tables the nightly export loads, each with an updatedAt column. */
export const WAREHOUSE_TABLES: readonly ExportTableName[] = [
  'reports',
  'appeals',
  'support_tickets',
  'transactions',
  'feature_flags',
];

/** How many of the last nightly exports the report shows. */
export const RECENT_EXPORTS = 3;

export interface WarehouseTable {
  name: string;
  rows: number;
  bytes: number;
  // The newest updatedAt, for the tables the export loads.
  newestRowAt: string | null;
}

export type WarehouseFailureKind =
  | 'export_folder_not_writable'
  | 'path_missing'
  | 'load_failed'
  | 'database_read_failed'
  | 'other';

export interface WarehouseReport {
  generatedAt: string;
  // Whether the backend has the warehouse's address; never the address.
  configured: boolean;
  // null when not configured; a fixed kind when it could not be read.
  tables: WarehouseTable[] | null;
  readError: 'unreachable' | null;
  exportFolder: 'missing' | 'writable' | 'not_writable';
  // The last nightly exports: their folder name (a date) and rows by table.
  recentExports: { name: string; rows: Record<string, number> }[];
  job: {
    completed: number;
    failed: number;
    scheduled: number;
    lastFailure: WarehouseFailureKind | null;
  } | null;
}

/**
 * The kind of a failed export, never its message: the message of a failed
 * load can quote the rows it was sending.
 */
export function classifyFailure(reason: string): WarehouseFailureKind {
  if (/EACCES|EPERM/.test(reason)) return 'export_folder_not_writable';
  if (/ENOENT/.test(reason)) return 'path_missing';
  if (/ClickHouse/.test(reason)) return 'load_failed';
  if (/Prisma|database|Database/.test(reason)) return 'database_read_failed';
  return 'other';
}

/** Rows of a CSV with a header line, counted without reading it at once. */
async function csvRows(file: string): Promise<number> {
  let lines = 0;
  let last = -1;
  for await (const chunk of fs.createReadStream(file)) {
    const bytes = chunk as Buffer;
    for (let i = 0; i < bytes.length; i++) if (bytes[i] === 10) lines++;
    if (bytes.length > 0) last = bytes[bytes.length - 1];
  }
  // A last line without its newline is a line too.
  if (last !== -1 && last !== 10) lines++;
  return Math.max(0, lines - 1);
}

/**
 * What the analytics warehouse holds (ADR-0016), read from the backend: for
 * each table its rows, its size and its newest row; and the backend's side
 * of the nightly load. Table names, counts, sizes and dates only: never a
 * row, an id or a setting.
 */
@Injectable()
export class WarehouseReportService {
  constructor(
    @Inject(ClickHouseLoadService)
    private readonly clickHouse: ClickHouseLoadService,
    @Inject(WarehouseExportService)
    private readonly exports: WarehouseExportService,
    @Inject(OPERATIONS_QUEUES) private readonly queues: Queue[],
  ) {}

  async report(): Promise<WarehouseReport> {
    const root = this.exports.exportRoot();
    const configured = this.clickHouse.isConfigured();
    const [tables, exportFolder, recentExports, job] = await Promise.all([
      configured ? this.tables() : Promise.resolve(null),
      this.folderState(root),
      this.recentExports(root),
      this.job(),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      configured,
      tables: tables === 'unreachable' ? null : tables,
      readError: tables === 'unreachable' ? 'unreachable' : null,
      exportFolder,
      recentExports,
      job,
    };
  }

  private async tables(): Promise<WarehouseTable[] | 'unreachable'> {
    try {
      // last_part_change moves with background merges too: it is not a sign
      // of a load. A load shows as more rows, or a newer updatedAt.
      const rows =
        (await this.clickHouse.select<{
          name: string;
          rows: string | number;
          bytes: string | number;
        }>(
          `SELECT t.name AS name, ifNull(p.rows, 0) AS rows, ifNull(p.bytes, 0) AS bytes
           FROM system.tables AS t
           LEFT JOIN (
             SELECT table, sum(rows) AS rows, sum(bytes_on_disk) AS bytes
             FROM system.parts WHERE database = currentDatabase() AND active GROUP BY table
           ) AS p ON p.table = t.name
           WHERE t.database = currentDatabase()
           ORDER BY t.name`,
        )) ?? [];
      return await Promise.all(
        rows.map(async (row) => ({
          name: row.name,
          rows: Number(row.rows),
          bytes: Number(row.bytes),
          newestRowAt: (WAREHOUSE_TABLES as readonly string[]).includes(
            row.name,
          )
            ? await this.newestRow(row.name)
            : null,
        })),
      );
    } catch {
      return 'unreachable';
    }
  }

  // The name is one of WAREHOUSE_TABLES, never a person's text.
  private async newestRow(table: string): Promise<string | null> {
    const [row] =
      (await this.clickHouse.select<{ newest: string | null }>(
        `SELECT if(count() = 0, NULL, toString(max(updatedAt))) AS newest FROM ${table}`,
      )) ?? [];
    return row?.newest ?? null;
  }

  private async folderState(
    root: string,
  ): Promise<WarehouseReport['exportFolder']> {
    try {
      await fs.promises.access(root, fs.constants.F_OK);
    } catch {
      return 'missing';
    }
    try {
      await fs.promises.access(root, fs.constants.W_OK);
      return 'writable';
    } catch {
      return 'not_writable';
    }
  }

  private async recentExports(
    root: string,
  ): Promise<WarehouseReport['recentExports']> {
    let names: string[];
    try {
      names = await fs.promises.readdir(root);
    } catch {
      return [];
    }
    const recent = names
      .filter((name) => EXPORT_FOLDER.test(name))
      .sort()
      .slice(-RECENT_EXPORTS);
    return Promise.all(
      recent.map(async (name) => {
        const rows: Record<string, number> = {};
        for (const table of WAREHOUSE_TABLES) {
          try {
            rows[table] = await csvRows(path.join(root, name, `${table}.csv`));
          } catch {
            // A table with no file in this export is left out.
          }
        }
        return { name, rows };
      }),
    );
  }

  private async job(): Promise<WarehouseReport['job']> {
    const queue = this.queues.find(
      (candidate) => candidate.name === QUEUE_NAMES.WAREHOUSE_EXPORT,
    );
    if (!queue) return null;
    try {
      const counts = await queue.getJobCounts('completed', 'failed', 'delayed');
      const [last] = await queue.getFailed(0, 0);
      return {
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        scheduled: counts.delayed ?? 0,
        lastFailure: last ? classifyFailure(last.failedReason ?? '') : null,
      };
    } catch {
      return null;
    }
  }
}
