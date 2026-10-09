import type { SupportTicketCreatedEvent } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminAction } from '@prisma/client';
import {
  primaryProfileIdForUser,
  withPrimaryProfile,
} from '../common/utils/user-profile-shape.util.js';
import { EmailService } from '../email/email.service.js';
import type {
  AccountCardProvider,
  HandoverCase,
  HandoverGateway,
  OrganizationScope,
  RequesterDirectory,
  RequesterNotifier,
  RequesterSummary,
  StaffActionLog,
  TeamChannel,
  TicketNotice,
} from '../helpdesk/helpdesk-host.contracts.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';

// CircleSfera as the host of the Help Desk: how each thing the Help Desk
// asks for is answered from CircleSfera's own records. A requester is a
// User; an agent is an AdminIdentity; the other team is moderation.

/** The one Help Desk organization of today, created by its migration. */
export const CIRCLESFERA_HELPDESK_ORGANIZATION_ID =
  '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0';

// Every requester and every agent of CircleSfera belongs to CircleSfera's
// own Help Desk organization.
@Injectable()
export class CircleSferaOrganizationScope implements OrganizationScope {
  current() {
    return CIRCLESFERA_HELPDESK_ORGANIZATION_ID;
  }
}

@Injectable()
export class CircleSferaRequesterDirectory implements RequesterDirectory {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async describe(requesterRefs: string[]) {
    const found = new Map<string, RequesterSummary>();
    if (requesterRefs.length === 0) return found;
    const users = await this.prisma.user.findMany({
      where: { id: { in: requesterRefs } },
      select: {
        id: true,
        email: true,
        profiles: {
          select: { username: true, avatar: true, fullName: true },
        },
      },
    });
    for (const user of users) found.set(user.id, withPrimaryProfile(user));
    return found;
  }
}

@Injectable()
export class CircleSferaAccountCard implements AccountCardProvider {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Plan, payout account and standing of each Profile.
  async accountCard(requesterRef: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: requesterRef },
      select: {
        id: true,
        isActive: true,
        createdAt: true,
        identityVerifiedAt: true,
        stripeConnectAccountId: true,
        monetization: { select: { transfersEnabled: true } },
        profiles: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            username: true,
            accountType: true,
            verificationLevel: true,
            isAccountBanned: true,
            suspendedUntil: true,
          },
        },
        platformSubscriptions: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            plan: { select: { name: true } },
          },
        },
      },
    });
    if (!user) return null;

    const [subscription] = user.platformSubscriptions;
    const now = new Date();
    return {
      userId: user.id,
      isActive: user.isActive,
      memberSince: user.createdAt,
      identityVerified: !!user.identityVerifiedAt,
      plan: subscription
        ? {
            name: subscription.plan.name,
            renewsAt: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      payouts: {
        connected: !!user.stripeConnectAccountId,
        enabled: !!user.monetization?.transfersEnabled,
      },
      profiles: user.profiles.map((profile) => ({
        id: profile.id,
        username: profile.username,
        accountType: profile.accountType,
        verificationLevel: profile.verificationLevel,
        banned: profile.isAccountBanned,
        suspended: !!profile.suspendedUntil && profile.suspendedUntil > now,
      })),
    };
  }
}

// Handing a ticket over opens a report in the trust queues.
@Injectable()
export class ModerationHandover implements HandoverGateway {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async open(ticket: {
    id: string;
    requesterRef: string | null;
    subject: string;
    message: string;
  }) {
    // A report is filed by a Profile: the first one of whoever wrote in.
    const reporter = ticket.requesterRef
      ? await this.prisma.profile.findFirst({
          where: { userId: ticket.requesterRef },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      : null;
    if (!reporter) return null;

    const report = await this.prisma.report.create({
      data: {
        reporterId: reporter.id,
        reason: 'OTHER',
        targetType: 'SYSTEM',
        targetId: ticket.id,
        details: `Support ticket: ${ticket.subject}\n\n${ticket.message}`,
      },
      select: { id: true },
    });
    return { caseRef: report.id };
  }

  async withdraw(caseRef: string) {
    await this.prisma.report.deleteMany({
      where: { id: caseRef, targetType: 'SYSTEM', status: 'PENDING' },
    });
  }

  async cases(caseRefs: string[]) {
    const found = new Map<string, HandoverCase>();
    if (caseRefs.length === 0) return found;
    const reports = await this.prisma.report.findMany({
      where: { id: { in: caseRefs } },
      select: { id: true, status: true },
    });
    for (const report of reports) {
      found.set(report.id, {
        id: report.id,
        status: report.status,
        pending: ['PENDING', 'REVIEWING'].includes(report.status),
      });
    }
    return found;
  }
}

// The answer of the team reaches the requester by email, with a link to the
// request, and as a notice in the app on their main Profile.
@Injectable()
export class CircleSferaRequesterNotifier implements RequesterNotifier {
  constructor(
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
  ) {}

  async answer(ticket: TicketNotice, body: string) {
    await this.email.sendSupportReplyEmail(
      ticket.email,
      ticket.subject,
      body,
      ticket.id,
    );

    const recipientId = ticket.requesterRef
      ? await primaryProfileIdForUser(this.prisma, ticket.requesterRef)
      : null;
    if (!recipientId) return;
    this.eventEmitter.emit('notification.create', {
      recipientId,
      type: 'SYSTEM',
      notice: { key: 'support_answered', subject: ticket.subject },
      targetType: 'support_ticket',
      targetId: ticket.id,
    });
  }

  async remind(ticket: TicketNotice, solvedInDays: number) {
    await this.email.sendSupportReminderEmail(
      ticket.email,
      ticket.subject,
      ticket.reference,
      ticket.id,
      solvedInDays,
    );
  }
}

// The team hears about a new ticket through the event the internal channel
// already listens to, and about a reply through the same channel.
@Injectable()
export class CircleSferaTeamChannel implements TeamChannel {
  constructor(
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
    @Inject(SlackService) private readonly slack: SlackService,
  ) {}

  ticketOpened(ticket: object) {
    this.eventEmitter.emit(
      'support.ticket_created',
      ticket as SupportTicketCreatedEvent['payload'],
    );
  }

  async requesterReplied(ticket: TicketNotice) {
    await this.slack.sendSupportReplyAlert(ticket);
  }
}

@Injectable()
export class AdminAuditStaffActionLog implements StaffActionLog {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(agentRef: string, ticketId: string, details: string) {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId: agentRef,
        action: AdminAction.MANUAL_OVERRIDE,
        targetType: 'support_ticket',
        targetId: ticketId,
        details,
      },
    });
  }
}
