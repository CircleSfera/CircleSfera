import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminAuditStaffActionLog,
  CIRCLESFERA_HELPDESK_ORGANIZATION_ID,
  CircleSferaAccountCard,
  CircleSferaOrganizationScope,
  CircleSferaRequesterDirectory,
  CircleSferaRequesterNotifier,
  CircleSferaTeamChannel,
  ModerationHandover,
} from './circlesfera-helpdesk-host.js';

// CircleSfera's answers to what the Help Desk asks of its host.
describe('CircleSfera as the host of the Help Desk', () => {
  const prisma = {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    profile: { findFirst: vi.fn() },
    report: { create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    adminAuditLog: { create: vi.fn() },
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('puts every request in the one organization its migration created', async () => {
    const { readFileSync } = await import('node:fs');
    const migration = readFileSync(
      new URL(
        '../../prisma/migrations/20261008220000_helpdesk_organization_and_messages/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(new CircleSferaOrganizationScope().current()).toBe(
      CIRCLESFERA_HELPDESK_ORGANIZATION_ID,
    );
    // The id in the code is the id the migration inserts.
    expect(migration).toContain(CIRCLESFERA_HELPDESK_ORGANIZATION_ID);
  });

  describe('requester directory', () => {
    const directory = new CircleSferaRequesterDirectory(prisma as never);

    it('describes a requester by the account and its first Profile', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u-1',
          email: 'ana@example.com',
          profiles: [{ username: 'ana', avatar: null, fullName: 'Ana Ruiz' }],
        },
      ]);

      const found = await directory.describe(['u-1', 'u-gone']);

      expect(found.get('u-1')).toEqual({
        id: 'u-1',
        email: 'ana@example.com',
        profile: { username: 'ana', avatar: null, fullName: 'Ana Ruiz' },
      });
      expect(found.has('u-gone')).toBe(false);
    });

    it('asks the database nothing for an empty list', async () => {
      expect((await directory.describe([])).size).toBe(0);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('account card', () => {
    const cards = new CircleSferaAccountCard(prisma as never);

    it('shows plan, payout account and the standing of each Profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        isActive: true,
        createdAt: new Date('2026-01-01'),
        identityVerifiedAt: new Date('2026-02-01'),
        stripeConnectAccountId: 'acct_1',
        monetization: { transfersEnabled: true },
        profiles: [
          {
            id: 'p-1',
            username: 'ana',
            accountType: 'CREATOR',
            verificationLevel: 'ELITE',
            isAccountBanned: false,
            suspendedUntil: new Date(Date.now() + 86_400_000),
          },
        ],
        platformSubscriptions: [
          {
            currentPeriodEnd: new Date('2026-11-01'),
            cancelAtPeriodEnd: false,
            plan: { name: 'Elite Creator' },
          },
        ],
      });

      const card = await cards.accountCard('u-1');

      expect(card).toMatchObject({
        userId: 'u-1',
        identityVerified: true,
        plan: { name: 'Elite Creator', cancelAtPeriodEnd: false },
        payouts: { connected: true, enabled: true },
        profiles: [{ username: 'ana', banned: false, suspended: true }],
      });
      // The card never carries the email, the payout account id or dates of
      // the identity check.
      expect(JSON.stringify(card)).not.toContain('acct_1');
    });

    it('is empty when the account no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      expect(await cards.accountCard('u-gone')).toBeNull();
    });
  });

  describe('handover to moderation', () => {
    const handover = new ModerationHandover(prisma as never);
    const ticket = {
      id: 't-1',
      requesterRef: 'u-1',
      subject: 'Someone is harassing me',
      message: 'It keeps happening.',
    };

    it('files a report for the trust queues by the first Profile of the requester', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: 'p-1' });
      prisma.report.create.mockResolvedValue({ id: 'r-1' });

      expect(await handover.open(ticket)).toEqual({ caseRef: 'r-1' });
      expect(prisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reporterId: 'p-1',
            reason: 'OTHER',
            targetType: 'SYSTEM',
            targetId: 't-1',
            details: expect.stringContaining(ticket.subject),
          }),
        }),
      );
    });

    it('opens nothing when the requester has no Profile or no account', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);

      expect(await handover.open(ticket)).toBeNull();
      expect(await handover.open({ ...ticket, requesterRef: null })).toBeNull();
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('takes back only a report of a ticket that nobody has started to review', async () => {
      await handover.withdraw('r-1');

      expect(prisma.report.deleteMany).toHaveBeenCalledWith({
        where: { id: 'r-1', targetType: 'SYSTEM', status: 'PENDING' },
      });
    });

    it('says a case is pending while its report is pending or under review', async () => {
      prisma.report.findMany.mockResolvedValue([
        { id: 'r-1', status: 'PENDING' },
        { id: 'r-2', status: 'REVIEWING' },
        { id: 'r-3', status: 'RESOLVED' },
      ]);

      const cases = await handover.cases(['r-1', 'r-2', 'r-3']);

      expect([...cases.values()].map((c) => c.pending)).toEqual([
        true,
        true,
        false,
      ]);
    });
  });

  describe('telling the requester', () => {
    const email = { sendSupportReplyEmail: vi.fn() };
    const eventEmitter = { emit: vi.fn() };
    const notifier = new CircleSferaRequesterNotifier(
      email as never,
      prisma as never,
      eventEmitter as never,
    );
    const ticket = {
      id: 't-1',
      reference: 42,
      subject: 'Help',
      email: 'ana@example.com',
      requesterRef: 'u-1',
    };

    it('sends the answer by email with the request it belongs to, and a notice in the app on their main Profile', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: 'p-1' });

      await notifier.answer(ticket, 'Fixed.');

      expect(email.sendSupportReplyEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Help',
        'Fixed.',
        't-1',
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('notification.create', {
        recipientId: 'p-1',
        type: 'SYSTEM',
        notice: { key: 'support_answered', subject: 'Help' },
        targetType: 'support_ticket',
        targetId: 't-1',
      });
    });

    it('sends only the email when the account no longer exists', async () => {
      eventEmitter.emit.mockClear();
      email.sendSupportReplyEmail.mockClear();

      await notifier.answer({ ...ticket, requesterRef: null }, 'Fixed.');

      expect(email.sendSupportReplyEmail).toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('never puts the text of the answer in the notice', async () => {
      eventEmitter.emit.mockClear();
      prisma.profile.findFirst.mockResolvedValue({ id: 'p-1' });

      await notifier.answer(ticket, 'A private detail.');

      expect(JSON.stringify(eventEmitter.emit.mock.calls)).not.toContain(
        'A private detail.',
      );
    });
  });

  describe('telling the team', () => {
    const eventEmitter = { emit: vi.fn() };
    const slack = { sendSupportReplyAlert: vi.fn() };
    const channel = new CircleSferaTeamChannel(
      eventEmitter as never,
      slack as never,
    );

    it('announces a new ticket with the event the channel listens to', () => {
      const ticket = { id: 't-1' };

      channel.ticketOpened(ticket);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'support.ticket_created',
        ticket,
      );
    });

    it('announces a reply of the requester in the same channel', async () => {
      const ticket = {
        id: 't-1',
        reference: 42,
        subject: 'Help',
        email: 'ana@example.com',
        requesterRef: 'u-1',
      };

      await channel.requesterReplied(ticket);

      expect(slack.sendSupportReplyAlert).toHaveBeenCalledWith(ticket);
    });
  });

  it('records what an agent did in the staff audit log', async () => {
    await new AdminAuditStaffActionLog(prisma as never).record(
      'admin-1',
      't-1',
      'Updated ticket t-1',
    );

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: 'admin-1',
        action: 'MANUAL_OVERRIDE',
        targetType: 'support_ticket',
        targetId: 't-1',
        details: 'Updated ticket t-1',
      },
    });
  });
});
