export const REPORT_MTTR_WINDOW_DAYS = 30;
export const REPORT_MTTR_SAMPLE_LIMIT = 500;

export type MttrRecord = {
  createdAt: Date;
  resolvedAt: Date | null;
};

export function medianMs(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

export function resolutionDurationsMs(
  records: ReadonlyArray<MttrRecord>,
): number[] {
  return records
    .filter(
      (r): r is { createdAt: Date; resolvedAt: Date } => r.resolvedAt != null,
    )
    .map((r) => r.resolvedAt.getTime() - r.createdAt.getTime())
    .filter((ms) => ms >= 0);
}

export function computeMttr(records: ReadonlyArray<MttrRecord>) {
  const durations = resolutionDurationsMs(records);
  return {
    windowDays: REPORT_MTTR_WINDOW_DAYS,
    resolvedCount: durations.length,
    medianMs: medianMs(durations),
  };
}

/** @deprecated Use resolutionDurationsMs */
export const reportResolutionDurationsMs = resolutionDurationsMs;

/** @deprecated Use computeMttr */
export const computeReportMttr = computeMttr;
