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

  it('closes solved tickets, and survives a failed run', async () => {
    const tickets = { closeSolvedTickets: vi.fn().mockResolvedValue(1) };
    await new HelpdeskScheduler(tickets as never).closeSolvedTickets();
    expect(tickets.closeSolvedTickets).toHaveBeenCalledTimes(1);

    tickets.closeSolvedTickets.mockRejectedValue(new Error('db down'));
    await expect(
      new HelpdeskScheduler(tickets as never).closeSolvedTickets(),
    ).resolves.toBeUndefined();
  });

  it('solves the tickets nobody answered and reminds the ones still waiting, and survives a failed run', async () => {
    const tickets = {
      solveUnansweredTickets: vi.fn().mockResolvedValue(1),
      remindWaitingTickets: vi.fn().mockResolvedValue(0),
    };
    await new HelpdeskScheduler(tickets as never).followUpWaitingTickets();
    expect(tickets.solveUnansweredTickets).toHaveBeenCalledTimes(1);
    expect(tickets.remindWaitingTickets).toHaveBeenCalledTimes(1);

    tickets.solveUnansweredTickets.mockResolvedValue(0);
    tickets.remindWaitingTickets.mockRejectedValue('db down');
    await expect(
      new HelpdeskScheduler(tickets as never).followUpWaitingTickets(),
    ).resolves.toBeUndefined();
  });
});
