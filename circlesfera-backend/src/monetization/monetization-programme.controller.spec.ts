import { describe, expect, it, vi } from 'vitest';
import { MonetizationProgrammeController } from './monetization-programme.controller.js';

describe('MonetizationProgrammeController', () => {
  const programme = {
    statusOf: vi.fn().mockResolvedValue({ status: 'NONE' }),
    apply: vi.fn().mockResolvedValue({ status: 'PENDING' }),
  };
  const controller = new MonetizationProgrammeController(programme as never);
  const req = { user: { userId: 'u1', profileId: 'p1' } } as never;

  it('reads the active Profile’s place in the programme', async () => {
    await expect(controller.status(req)).resolves.toEqual({ status: 'NONE' });
    expect(programme.statusOf).toHaveBeenCalledWith('u1', 'p1');
  });

  it('applies for the active Profile', async () => {
    await expect(
      controller.apply(req, { pitch: 'Cooking classes every week' }),
    ).resolves.toEqual({ status: 'PENDING' });
    expect(programme.apply).toHaveBeenCalledWith(
      'u1',
      'p1',
      'Cooking classes every week',
    );
  });
});
