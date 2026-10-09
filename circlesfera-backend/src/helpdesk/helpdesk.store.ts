import { Inject, Injectable } from '@nestjs/common';
import type {
  HelpdeskMessageVisibility,
  Prisma,
  TicketCategory,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ORGANIZATION_SCOPE,
  type OrganizationScope,
} from './helpdesk-host.contracts.js';

/** One change of a ticket and who made it. */
export interface TicketEventInput {
  kind: 'STATE' | 'TOPIC' | 'PRIORITY' | 'ASSIGNMENT' | 'HANDOVER';
  fromValue: string | null;
  toValue: string | null;
  actorKind: 'REQUESTER' | 'AGENT' | 'SYSTEM';
  actorRef: string | null;
}

type TicketChanges = Omit<
  Prisma.SupportTicketUncheckedUpdateInput,
  'id' | 'organizationId'
>;

/**
 * The only place of the Help Desk that talks to the database. Every read and
 * every write carries the organization of the current request, so a service
 * cannot reach a ticket of another organization by forgetting a filter.
 */
@Injectable()
export class HelpdeskStore {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ORGANIZATION_SCOPE)
    private readonly organization: OrganizationScope,
  ) {}

  private get organizationId() {
    return this.organization.current();
  }

  openTicket(ticket: {
    requesterRef: string;
    email: string;
    subject: string;
    message: string;
    category?: TicketCategory;
    // The closed ticket this one continues.
    previousTicketId?: string;
  }) {
    return this.prisma.supportTicket.create({
      data: {
        organizationId: this.organizationId,
        userId: ticket.requesterRef,
        email: ticket.email,
        subject: ticket.subject,
        // Kept while the column exists; the conversation is the messages.
        message: ticket.message,
        category: ticket.category,
        previousTicketId: ticket.previousTicketId,
        messages: {
          create: {
            authorKind: 'REQUESTER',
            authorRef: ticket.requesterRef,
            body: ticket.message,
          },
        },
      },
    });
  }

  /** A ticket of the organization that this requester opened, or nothing. */
  findRequesterTicket(id: string, requesterRef: string) {
    return this.prisma.supportTicket.findFirst({
      where: { id, organizationId: this.organizationId, userId: requesterRef },
    });
  }

  /** The tickets a requester opened, the one with the latest change first. */
  async listRequesterTickets(
    requesterRef: string,
    page: number,
    limit: number,
  ) {
    const where: Prisma.SupportTicketWhereInput = {
      organizationId: this.organizationId,
      userId: requesterRef,
    };
    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { tickets, total };
  }

  /** Tickets that are with another team, the one handed over first on top. */
  ticketsWithOtherTeam(limit: number) {
    return this.prisma.supportTicket.findMany({
      where: { organizationId: this.organizationId, status: 'ESCALATED' },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: { id: true, escalatedReportId: true },
    });
  }

  /**
   * The tickets solved before a moment. A ticket that is with another team,
   * or was reopened, is not solved and is not among them.
   */
  ticketsSolvedBefore(moment: Date, limit: number) {
    return this.prisma.supportTicket.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'RESOLVED',
        resolvedAt: { lt: moment },
      },
      orderBy: { resolvedAt: 'asc' },
      take: limit,
      select: { id: true, status: true },
    });
  }

  /**
   * The tickets that have waited for their requester since before a moment
   * and were not reminded yet. A wait starts with the last public message
   * or with the change to waiting, whichever came later.
   */
  ticketsWaitingSinceBefore(moment: Date, limit: number) {
    return this.prisma.supportTicket.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'WAITING',
        waitingRemindedAt: null,
        messages: {
          none: { visibility: 'PUBLIC', createdAt: { gte: moment } },
        },
        events: {
          none: {
            kind: 'STATE',
            toValue: 'WAITING',
            createdAt: { gte: moment },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: {
        id: true,
        reference: true,
        subject: true,
        email: true,
        userId: true,
      },
    });
  }

  /**
   * Marks a waiting ticket as reminded at a moment. False when it no longer
   * waits or was reminded already, so that one wait gets one reminder.
   */
  async claimReminder(id: string, moment: Date): Promise<boolean> {
    const { count } = await this.prisma.supportTicket.updateMany({
      where: {
        id,
        organizationId: this.organizationId,
        status: 'WAITING',
        waitingRemindedAt: null,
      },
      data: { waitingRemindedAt: moment },
    });
    return count === 1;
  }

  /** Takes back the mark of a reminder that could not be sent. */
  async releaseReminder(id: string, moment: Date): Promise<void> {
    await this.prisma.supportTicket.updateMany({
      where: {
        id,
        organizationId: this.organizationId,
        waitingRemindedAt: moment,
      },
      data: { waitingRemindedAt: null },
    });
  }

  /** The tickets still waiting whose reminder was sent before a moment. */
  ticketsRemindedBefore(moment: Date, limit: number) {
    return this.prisma.supportTicket.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'WAITING',
        waitingRemindedAt: { lt: moment },
      },
      orderBy: { waitingRemindedAt: 'asc' },
      take: limit,
      select: { id: true, status: true },
    });
  }

  /** A requester's tickets with their public messages, for a data export. */
  requesterExport(requesterRef: string) {
    return this.prisma.supportTicket.findMany({
      where: { organizationId: this.organizationId, userId: requesterRef },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        reference: true,
        subject: true,
        category: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        messages: {
          where: { visibility: 'PUBLIC' },
          orderBy: { createdAt: 'asc' },
          select: {
            authorKind: true,
            body: true,
            channel: true,
            createdAt: true,
          },
        },
      },
    });
  }

  /** Deletes solved and closed tickets that ended before a moment. */
  deleteEndedBefore(moment: Date) {
    return this.prisma.supportTicket.deleteMany({
      where: {
        organizationId: this.organizationId,
        status: { in: ['RESOLVED', 'CLOSED'] },
        OR: [
          { resolvedAt: { lt: moment } },
          { resolvedAt: null, updatedAt: { lt: moment } },
        ],
      },
    });
  }

  /** The open tickets, newest first, and how many there are. */
  async openTickets(take: number) {
    const where: Prisma.SupportTicketWhereInput = {
      organizationId: this.organizationId,
      status: 'OPEN',
    };
    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { tickets, total };
  }

  /** When tickets solved since a moment were opened and solved. */
  resolutionTimesSince(moment: Date, limit: number) {
    return this.prisma.supportTicket.findMany({
      where: {
        organizationId: this.organizationId,
        resolvedAt: { not: null, gte: moment },
      },
      orderBy: { resolvedAt: 'desc' },
      take: limit,
      select: { createdAt: true, resolvedAt: true },
    });
  }

  /** Id, state and times of the tickets that changed since a moment. */
  ticketFactsSince(moment: Date) {
    return this.prisma.supportTicket.findMany({
      where: {
        organizationId: this.organizationId,
        OR: [
          { createdAt: { gte: moment } },
          { updatedAt: { gte: moment } },
          { resolvedAt: { gte: moment } },
        ],
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
      },
    });
  }

  findTicket(id: string) {
    return this.prisma.supportTicket.findFirst({
      where: { id, organizationId: this.organizationId },
    });
  }

  async listTickets(
    filters: Pick<
      Prisma.SupportTicketWhereInput,
      'status' | 'category' | 'priority' | 'assignedAgentRef'
    >,
    page: number,
    limit: number,
    oldestFirst: boolean,
  ) {
    const where: Prisma.SupportTicketWhereInput = {
      ...filters,
      organizationId: this.organizationId,
    };
    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: oldestFirst ? 'asc' : 'desc' },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { tickets, total };
  }

  /**
   * Changes a ticket and, when given, adds a message to it in the same
   * statement.
   */
  updateTicket(
    id: string,
    changes: TicketChanges,
    message?: {
      authorKind: 'REQUESTER' | 'AGENT' | 'SYSTEM';
      authorRef: string | null;
      visibility: HelpdeskMessageVisibility;
      body: string;
    },
    // What changed and who changed it, written with the change.
    events: TicketEventInput[] = [],
  ) {
    // A ticket never changes identity or organization, whatever is passed.
    const {
      id: _id,
      organizationId: _organizationId,
      ...safeChanges
    } = changes as Prisma.SupportTicketUncheckedUpdateInput;
    return this.prisma.supportTicket.update({
      where: { id, organizationId: this.organizationId },
      data: {
        ...safeChanges,
        ...(message && { messages: { create: message } }),
        ...(events.length > 0 && { events: { create: events } }),
      },
    });
  }

  /** The conversation of a ticket, oldest first. */
  messages(ticketId: string, visibility?: HelpdeskMessageVisibility) {
    return this.prisma.helpdeskMessage.findMany({
      where: {
        ticketId,
        ticket: { organizationId: this.organizationId },
        ...(visibility && { visibility }),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        authorKind: true,
        authorRef: true,
        visibility: true,
        body: true,
        channel: true,
        createdAt: true,
      },
    });
  }
}
