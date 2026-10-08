import { describe, expect, it, vi } from 'vitest';
import { HelpdeskScheduler } from './helpdesk.scheduler.js';

describe('HelpdeskScheduler', () => {
  it('brings back the tickets another team has decided', async () => {
    const tickets = { returnDecidedHandovers: vi.fn().mockResolvedValue(2) };

    await new HelpdeskScheduler(tickets as never).returnDecidedHandovers();

    expect(tickets.returnDecidedHandovers).toHaveBeenCalledTimes(1);
  });

  it('survives a failed run: the next one tries again', async () => {
    const tickets = {
      returnDecidedHandovers: vi.fn().mockRejectedValue(new Error('db down')),
    };

    await expect(
      new HelpdeskScheduler(tickets as never).returnDecidedHandovers(),
    ).resolves.toBeUndefined();
  });
});
