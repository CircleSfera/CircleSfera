import { describe, expect, it, vi } from 'vitest';
import { ExportAnalyticsCsvUseCase } from './export-analytics-csv.use-case.js';

describe('ExportAnalyticsCsvUseCase', () => {
  const setup = () => {
    const prisma = { follow: { count: vi.fn().mockResolvedValue(42) } };
    const retention = {
      execute: vi
        .fn()
        .mockResolvedValue({ avgDwellSeconds: 12, peakActivityHourUTC: 18 }),
    };
    const useCase = new ExportAnalyticsCsvUseCase(
      prisma as never,
      retention as never,
    );
    return { useCase, prisma, retention };
  };

  it('writes the followers and the audience of the Profile, and no money', async () => {
    const { useCase, prisma, retention } = setup();

    const csv = await useCase.execute('profile-1', '7d');

    expect(prisma.follow.count).toHaveBeenCalledWith({
      where: { followingId: 'profile-1', status: 'ACCEPTED' },
    });
    expect(retention.execute).toHaveBeenCalledWith('profile-1');
    expect(csv).toBe(
      [
        'Metric,Value,Unit',
        'Period,7d,',
        'Total Followers,42,users',
        'Average Dwell Time,12,seconds',
        'Peak Activity Hour,18:00 UTC,hour',
      ].join('\n'),
    );
    expect(csv).not.toMatch(/revenue|tips|unlock|gift/i);
  });

  it('names the default period for one it does not know', async () => {
    const { useCase } = setup();

    expect(await useCase.execute('profile-1', '=cmd')).toContain('Period,30d,');
    expect(await useCase.execute('profile-1')).toContain('Period,30d,');
  });
});
