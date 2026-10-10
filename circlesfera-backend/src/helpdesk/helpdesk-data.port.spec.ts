import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskDataPort } from './helpdesk-data.port.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

// What the rest of the product may ask the Help Desk.
describe('HelpdeskDataPort', () => {
  const store = {
    requesterExport: vi.fn(),
    deleteEndedBefore: vi.fn(),
    ticketFactsSince: vi.fn(),
    openTickets: vi.fn(),
    resolutionTimesSince: vi.fn(),
  };
  const tickets = { answerFromTeamChannel: vi.fn() };
  const moduleRef = { get: vi.fn() };
  let port: HelpdeskDataPort;

  beforeEach(() => {
    vi.resetAllMocks();
    moduleRef.get.mockReturnValue(tickets);
    port = new HelpdeskDataPort(store as never, moduleRef as never);
  });

  it('answers each question through the store, which applies the organization', async () => {
    const moment = new Date('2026-09-01T00:00:00Z');
    store.requesterExport.mockResolvedValue([{ id: 't-1' }]);
    store.deleteEndedBefore.mockResolvedValue({ count: 4 });

    expect(await port.exportForRequester('u-1')).toEqual([{ id: 't-1' }]);
    expect(await port.deleteEndedBefore(moment)).toEqual({ count: 4 });
    await port.ticketFactsSince(moment);
    await port.openTickets(5);
    await port.resolutionTimesSince(moment, 100);

    expect(store.requesterExport).toHaveBeenCalledWith('u-1');
    expect(store.deleteEndedBefore).toHaveBeenCalledWith(moment);
    expect(store.ticketFactsSince).toHaveBeenCalledWith(moment);
    expect(store.openTickets).toHaveBeenCalledWith(5);
    expect(store.resolutionTimesSince).toHaveBeenCalledWith(moment, 100);
  });

  it('hands an answer from the team channel to the tickets service, found when it is needed', async () => {
    tickets.answerFromTeamChannel.mockResolvedValue(true);
    // Not looked up while the port is built: the two depend on each other.
    expect(moduleRef.get).not.toHaveBeenCalled();

    expect(await port.answerFromTeamChannel('t-1', 'Fixed.')).toBe(true);

    expect(moduleRef.get).toHaveBeenCalledWith(HelpdeskTicketsService, {
      strict: false,
    });
    expect(tickets.answerFromTeamChannel).toHaveBeenCalledWith('t-1', 'Fixed.');
  });
});
