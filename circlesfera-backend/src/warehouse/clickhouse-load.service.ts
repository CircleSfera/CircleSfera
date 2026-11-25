import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import {
  USER_HARD_DELETED_EVENT,
  type UserHardDeletedEvent,
} from '../users/events/user-hard-deleted.event.js';
import type { ExportRowCounts, ExportTableName } from './types/export.types.js';

/** Columns of the former payments to creators, gone from the export. */
export const RETIRED_PAYMENT_COLUMNS = [
  'receiverId',
  'receiverProfileId',
  'postId',
  'storyId',
  'liveStreamId',
] as const;

/** How long a read of the warehouse may take before it fails. */
export const SELECT_TIMEOUT_MS = 5_000;

@Injectable()
export class ClickHouseLoadService {
  private readonly logger = new Logger(ClickHouseLoadService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('CLICKHOUSE_URL')?.trim());
  }

  async loadExportDirectory(
    outputDir: string,
    rowCounts: ExportRowCounts,
  ): Promise<boolean> {
    const baseUrl = this.config.get<string>('CLICKHOUSE_URL')?.trim();
    if (!baseUrl) {
      this.logger.debug('CLICKHOUSE_URL unset — CSV export only (plan B path)');
      return false;
    }

    const database =
      this.config.get<string>('CLICKHOUSE_DATABASE')?.trim() ??
      'circlesfera_analytics';

    for (const table of Object.keys(rowCounts) as ExportTableName[]) {
      if (rowCounts[table] === 0) continue;
      if (table === 'transactions') {
        await this.dropRetiredPaymentColumns(baseUrl, database);
      }
      const csvPath = join(outputDir, `${table}.csv`);
      const csv = await readFile(csvPath, 'utf8');
      await this.insertCsv(baseUrl, database, table, csv);
      this.logger.log(`ClickHouse loaded ${rowCounts[table]} rows → ${table}`);
    }

    return true;
  }

  // When a person's account is erased, their payments leave the warehouse
  // too: every row the person paid, refunds included. The erasure goes on
  // whatever happens here; a failure is logged for staff.
  @OnEvent(USER_HARD_DELETED_EVENT)
  async eraseUser(event: UserHardDeletedEvent): Promise<void> {
    const baseUrl = this.config.get<string>('CLICKHOUSE_URL')?.trim();
    if (!baseUrl) return;
    const ids = [event.userId];
    const url = new URL(baseUrl);
    url.searchParams.set('database', this.database());
    url.searchParams.set(
      'query',
      'ALTER TABLE transactions DELETE WHERE senderId IN {ids:Array(String)}',
    );
    url.searchParams.set(
      'param_ids',
      `[${ids.map((id) => `'${id.replace(/['\\]/g, '')}'`).join(',')}]`,
    );
    try {
      await this.post(url, 'text/plain', '', 'erase a person');
      this.logger.log(
        `ClickHouse rows of an erased person removed (${ids.length} ids)`,
      );
    } catch (err) {
      this.logger.error(
        `ClickHouse rows of an erased person could not be removed: ${String(err)}`,
      );
    }
  }

  // A table created before payments to creators were removed still has their
  // columns. They are dropped before payments are loaded; once gone, the
  // statement changes nothing.
  private async dropRetiredPaymentColumns(
    baseUrl: string,
    database: string,
  ): Promise<void> {
    const url = new URL(baseUrl);
    url.searchParams.set('database', database);
    url.searchParams.set(
      'query',
      `ALTER TABLE transactions ${RETIRED_PAYMENT_COLUMNS.map(
        (column) => `DROP COLUMN IF EXISTS ${column}`,
      ).join(', ')}`,
    );
    await this.post(url, 'text/plain', '', 'drop retired payment columns');
  }

  private database(): string {
    return (
      this.config.get<string>('CLICKHOUSE_DATABASE')?.trim() ??
      'circlesfera_analytics'
    );
  }

  private async insertCsv(
    baseUrl: string,
    database: string,
    table: string,
    csv: string,
  ): Promise<void> {
    const url = new URL(baseUrl);
    url.searchParams.set('database', database);
    url.searchParams.set('query', `INSERT INTO ${table} FORMAT CSVWithNames`);
    // Each value goes to the column its CSV header names, never by position.
    // A column of the table the export does not carry takes its default
    // (NULL when it may be empty), and a column the export gained before the
    // table did is left out, rather than failing the whole load.
    url.searchParams.set('input_format_with_names_use_header', '1');
    url.searchParams.set('input_format_defaults_for_omitted_fields', '1');
    url.searchParams.set('input_format_skip_unknown_fields', '1');
    await this.post(url, 'text/csv', csv, `insert into ${table}`);
  }

  // Sends one statement, with the credentials the address carries as a
  // header rather than in the address.
  private async post(
    url: URL,
    contentType: string,
    body: string,
    what: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': contentType,
    };
    const user = url.username;
    const password = url.password;
    if (user) {
      headers.Authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
      url.username = '';
      url.password = '';
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body,
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `ClickHouse ${what} failed (${response.status}): ${text.slice(0, 500)}`,
      );
    }
    return response;
  }

  // Runs one read-only query and answers its rows; null when the warehouse
  // is not configured. The query is the caller's own text, never a person's.
  // A warehouse that does not answer within timeoutMs fails the read.
  async select<Row>(
    query: string,
    timeoutMs = SELECT_TIMEOUT_MS,
  ): Promise<Row[] | null> {
    const baseUrl = this.config.get<string>('CLICKHOUSE_URL')?.trim();
    if (!baseUrl) return null;
    const url = new URL(baseUrl);
    url.searchParams.set('database', this.database());
    // The server refuses anything but a read in this request.
    url.searchParams.set('readonly', '1');
    const response = await this.post(
      url,
      'text/plain',
      `${query} FORMAT JSON`,
      'read',
      AbortSignal.timeout(timeoutMs),
    );
    const body = (await response.json()) as { data?: Row[] };
    return body.data ?? [];
  }
}
