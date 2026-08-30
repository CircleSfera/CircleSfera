export type ExportTableName =
  | 'reports'
  | 'appeals'
  | 'support_tickets'
  | 'transactions'
  | 'feature_flags';

export type ExportRowCounts = Record<ExportTableName, number>;

export interface AnalyticsExportResult {
  outputDir: string;
  rowCounts: ExportRowCounts;
  durationMs: number;
  clickhouseLoaded: boolean;
}
