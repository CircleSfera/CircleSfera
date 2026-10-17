import { describe, expect, it, vi } from 'vitest';
import { GetReportsQuery } from './get-reports.query.js';

describe('GetReportsQuery', () => {
  it('puts a report of self-harm first, then the newest', async () => {
    const prisma = {
      report: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const query = new GetReportsQuery(prisma as never);

    await query.execute(1, 10, undefined, 'PENDING');

    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PENDING' },
        orderBy: [{ urgent: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  });

  it('finds the new reasons by name', async () => {
    const prisma = {
      report: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const query = new GetReportsQuery(prisma as never);

    await query.execute(1, 10, 'self_harm');

    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ reason: 'SELF_HARM' }]),
        }),
      }),
    );
  });
});
