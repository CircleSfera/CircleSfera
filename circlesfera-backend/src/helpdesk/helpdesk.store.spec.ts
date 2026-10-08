import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskStore } from './helpdesk.store.js';

// The data access layer of the Help Desk: every read and every write carries
// the organization of the current request.
describe('HelpdeskStore', () => {
  const prisma = {
    supportTicket: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
    },
    helpdeskMessage: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const organization = { current: vi.fn() };
  let store: HelpdeskStore;

  beforeEach(() => {
    vi.clearAllMocks();
    organization.current.mockReturnValue('org-1');
    store = new HelpdeskStore(prisma as never, organization);
  });

  it('opens a ticket in the organization of the request, with its first message', async () => {
    await store.openTicket({
      requesterRef: 'u-1',
      email: 'ana@example.com',
      subject: 'Help',
      message: 'I cannot sign in',
      category: 'ACCOUNT',
    });

    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        userId: 'u-1',
        email: 'ana@example.com',
        subject: 'Help',
        message: 'I cannot sign in',
        category: 'ACCOUNT',
        messages: {
          create: {
            authorKind: 'REQUESTER',
            authorRef: 'u-1',
            body: 'I cannot sign in',
          },
        },
      },
    });
  });

  it('finds a ticket only inside the organization', async () => {
    await store.findTicket('t-1');

    expect(prisma.supportTicket.findFirst).toHaveBeenCalledWith({
      where: { id: 't-1', organizationId: 'org-1' },
    });
  });

  it('lists and counts only the tickets of the organization', async () => {
    await store.listTickets({ status: 'OPEN' }, 2, 20, true);

    const where = { status: 'OPEN', organizationId: 'org-1' };
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith({
      where,
      skip: 20,
      take: 20,
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.supportTicket.count).toHaveBeenCalledWith({ where });
  });

  it('cannot be asked for another organization through a filter', async () => {
    await store.listTickets({ organizationId: 'org-2' } as never, 1, 20, false);

    expect(prisma.supportTicket.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
    });
  });

  it('changes a ticket only inside the organization, and never moves it to another', async () => {
    await store.updateTicket('t-1', {
      status: 'CLOSED',
      organizationId: 'org-2',
    } as never);

    const call = prisma.supportTicket.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 't-1', organizationId: 'org-1' });
    expect(call.data).not.toHaveProperty('messages');
    // The type forbids it; the organization of the request wins regardless.
    expect(call.data.organizationId).toBeUndefined();
  });

  it('adds a message with the change, in one statement', async () => {
    const message = {
      authorKind: 'AGENT' as const,
      authorRef: 'admin-1',
      visibility: 'INTERNAL' as const,
      body: 'Checked the payment.',
    };

    await store.updateTicket('t-1', {}, message);

    expect(prisma.supportTicket.update).toHaveBeenCalledWith({
      where: { id: 't-1', organizationId: 'org-1' },
      data: { messages: { create: message } },
    });
  });

  it('reads the conversation of a ticket of the organization, oldest first', async () => {
    await store.messages('t-1');

    const query = prisma.helpdeskMessage.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      ticketId: 't-1',
      ticket: { organizationId: 'org-1' },
    });
    expect(query.orderBy).toEqual({ createdAt: 'asc' });
  });

  it('leaves internal notes out when only public messages are asked for', async () => {
    await store.messages('t-1', 'PUBLIC');

    expect(prisma.helpdeskMessage.findMany.mock.calls[0][0].where).toEqual({
      ticketId: 't-1',
      ticket: { organizationId: 'org-1' },
      visibility: 'PUBLIC',
    });
  });
});
