import { describe, expect, it, vi } from 'vitest';
import { GetAudienceRetentionQuery } from './get-audience-retention.query.js';

describe('GetAudienceRetentionQuery', () => {
  it('answers the average dwell in seconds, from milliseconds stored', async () => {
    const prisma = {
      post: { findMany: vi.fn().mockResolvedValue([{ id: 'post-1' }]) },
      interactionEvent: {
        findMany: vi.fn().mockResolvedValue([
          { dwellTime: 4000, createdAt: new Date('2026-10-14T10:00:00Z') },
          { dwellTime: 8000, createdAt: new Date('2026-10-14T10:30:00Z') },
        ]),
      },
    };

    const result = await new GetAudienceRetentionQuery(prisma as never).execute(
      'p-1',
    );

    expect(result.avgDwellSeconds).toBe(6);
    expect(result.peakActivityHourUTC).toBe(10);
  });
});
