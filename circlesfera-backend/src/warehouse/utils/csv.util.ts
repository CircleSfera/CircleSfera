import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExportTableName } from '../types/export.types.js';

export async function writeCsvFile(
  outputDir: string,
  table: ExportTableName,
  headers: readonly string[],
  rows: ReadonlyArray<Record<string, unknown>>,
): Promise<number> {
  await mkdir(outputDir, { recursive: true });
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((header) => escapeCsvField(formatCsvValue(row[header])))
        .join(','),
    );
  }
  await writeFile(
    join(outputDir, `${table}.csv`),
    `${lines.join('\n')}\n`,
    'utf8',
  );
  return rows.length;
}

function formatCsvValue(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
