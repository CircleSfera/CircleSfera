import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExportRowCounts, ExportTableName } from './types/export.types.js';

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
      const csvPath = join(outputDir, `${table}.csv`);
      const csv = await readFile(csvPath, 'utf8');
      await this.insertCsv(baseUrl, database, table, csv);
      this.logger.log(`ClickHouse loaded ${rowCounts[table]} rows → ${table}`);
    }

    return true;
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

    const headers: Record<string, string> = {
      'Content-Type': 'text/csv',
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
      body: csv,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `ClickHouse insert into ${table} failed (${response.status}): ${body.slice(0, 500)}`,
      );
    }
  }
}
