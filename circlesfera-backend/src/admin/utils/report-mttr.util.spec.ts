import { describe, expect, it } from 'vitest';
import {
  computeMttr,
  medianMs,
  resolutionDurationsMs,
} from './report-mttr.util.js';

describe('report-mttr.util', () => {
  it('medianMs returns null for empty input', () => {
    expect(medianMs([])).toBeNull();
  });

  it('medianMs returns middle value for odd count', () => {
    expect(medianMs([100, 300, 200])).toBe(200);
  });

  it('medianMs averages middle pair for even count', () => {
    expect(medianMs([100, 400, 200, 300])).toBe(250);
  });

  it('resolutionDurationsMs ignores unresolved and negative spans', () => {
    const created = new Date('2026-08-01T10:00:00Z');
    const resolved = new Date('2026-08-01T12:00:00Z');
    expect(
      resolutionDurationsMs([
        { createdAt: created, resolvedAt: resolved },
        { createdAt: created, resolvedAt: null },
        {
          createdAt: resolved,
          resolvedAt: created,
        },
      ]),
    ).toEqual([2 * 60 * 60 * 1000]);
  });

  it('computeMttr aggregates median and count', () => {
    const base = new Date('2026-08-01T00:00:00Z');
    const result = computeMttr([
      {
        createdAt: base,
        resolvedAt: new Date(base.getTime() + 60 * 60 * 1000),
      },
      {
        createdAt: base,
        resolvedAt: new Date(base.getTime() + 3 * 60 * 60 * 1000),
      },
    ]);
    expect(result.resolvedCount).toBe(2);
    expect(result.windowDays).toBe(30);
    expect(result.medianMs).toBe(2 * 60 * 60 * 1000);
  });
});
