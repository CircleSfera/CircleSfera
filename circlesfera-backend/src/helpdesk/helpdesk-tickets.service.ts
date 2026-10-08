import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, TicketCategory, TicketStatus } from '@prisma/client';
import { resolvedAtOnStatusChange } from '../common/utils/resolved-at.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateTicketDto } from './dto/create-ticket.dto.js';
import {
  ACCOUNT_CARD_PROVIDER,
  type AccountCardProvider,
  HANDOVER_GATEWAY,
  type HandoverGateway,
  REQUESTER_DIRECTORY,
  REQUESTER_NOTIFIER,
  type RequesterDirectory,
  type RequesterNotifier,
  STAFF_ACTION_LOG,
  type StaffActionLog,
  TEAM_CHANNEL,
  type TeamChannel,
} from './helpdesk-host.contracts.js';

// Tickets of the Help Desk: opened by a requester, listed, answered and
// handed to another team by an agent. Everything it needs from the product
// around it comes through the host contracts.
@Injectable()
export class HelpdeskTicketsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REQUESTER_DIRECTORY)
    private readonly requesters: RequesterDirectory,
    @Inject(ACCOUNT_CARD_PROVIDER)
    private readonly accountCards: AccountCardProvider,
    @Inject(HANDOVER_GATEWAY) private readonly handover: HandoverGateway,
    @Inject(REQUESTER_NOTIFIER) private readonly notifier: RequesterNotifier,
    @Inject(TEAM_CHANNEL) private readonly teamChannel: TeamChannel,
    @Inject(STAFF_ACTION_LOG) private readonly staffLog: StaffActionLog,
  ) {}

  async createTicket(dto: CreateTicketDto & { email: string; userId: string }) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
        category: dto.category,
        userId: dto.userId,
      },
    });

    this.teamChannel.ticketOpened(ticket);

    return {
      success: true,
      message: 'Support ticket created successfully',
      ticketId: ticket.id,
    };
  }

  async listTickets(page = 1, limit = 20, status?: string, category?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.SupportTicketWhereInput = {};
    if (
      status &&
      ['OPEN', 'RESOLVED', 'CLOSED', 'ESCALATED'].includes(status)
    ) {
      where.status = status as TicketStatus;
    }
    if (
      category &&
      ['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'].includes(category)
    ) {
      where.category = category as TicketCategory;
    }

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take: limit,
        // Open tickets: the one waiting longest first. Any other list: newest first.
        orderBy: { createdAt: where.status === 'OPEN' ? 'asc' : 'desc' },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    const present = (values: (string | null)[]) => [
      ...new Set(values.filter((value): value is string => !!value)),
    ];
    const [requesters, cases] = await Promise.all([
      this.requesters.describe(present(tickets.map((t) => t.userId))),
      // Where the ticket stands with the other team, when it was handed over
      this.handover.cases(present(tickets.map((t) => t.escalatedReportId))),
    ]);

    return {
      data: tickets.map((ticket) => {
        const handed = ticket.escalatedReportId
          ? cases.get(ticket.escalatedReportId)
          : undefined;
        return {
          ...ticket,
          user: (ticket.userId && requesters.get(ticket.userId)) || null,
          escalatedReport: handed
            ? { id: handed.id, status: handed.status }
            : null,
        };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async updateTicket(
    agentRef: string,
    id: string,
    data: { status?: TicketStatus; reply?: string },
  ) {
    const existing = await this.prisma.supportTicket.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Support ticket not found');
    }

    // A ticket handed to another team is theirs until they decide its case;
    // support cannot answer or close it meanwhile.
    if (existing.status === 'ESCALATED' && existing.escalatedReportId) {
      const cases = await this.handover.cases([existing.escalatedReportId]);
      if (cases.get(existing.escalatedReportId)?.pending) {
        throw new ConflictException(
          'This ticket is with moderation until its report is decided',
        );
      }
    }

    const updateData: Prisma.SupportTicketUpdateInput = {};
    if (data.reply !== undefined) updateData.reply = data.reply;

    const effectiveStatus =
      data.status ??
      (data.reply?.trim() && existing.status === 'OPEN'
        ? 'RESOLVED'
        : undefined);

    if (effectiveStatus) {
      updateData.status = effectiveStatus;
      const resolvedAt = resolvedAtOnStatusChange(
        effectiveStatus,
        existing.resolvedAt,
        ['RESOLVED', 'CLOSED'],
        'OPEN',
      );
      if (resolvedAt !== undefined) {
        updateData.resolvedAt = resolvedAt;
      }
    }

    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: updateData,
    });

    if (data.reply?.trim()) {
      await this.notifier.answer(ticket, data.reply.trim());
    }

    await this.staffLog.record(
      agentRef,
      id,
      `Updated ticket ${id}${effectiveStatus ? ` → ${effectiveStatus}` : data.status ? ` → ${data.status}` : ''}${data.reply ? ' (replied)' : ''}`,
    );

    return ticket;
  }

  // Hands a ticket to another team: a case is opened there, linked to the
  // ticket, and the ticket is marked as being with them.
  async handOver(agentRef: string, id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (ticket.status !== 'OPEN') {
      throw new ConflictException('Only an open ticket can be handed over');
    }

    const opened = await this.handover.open({
      id: ticket.id,
      requesterRef: ticket.userId,
      subject: ticket.subject,
      message: ticket.message,
    });
    if (!opened) {
      throw new ConflictException(
        'The account that wrote this ticket no longer exists',
      );
    }

    let updated: Awaited<ReturnType<typeof this.prisma.supportTicket.update>>;
    try {
      updated = await this.prisma.supportTicket.update({
        where: { id },
        data: { status: 'ESCALATED', escalatedReportId: opened.caseRef },
      });
    } catch (error) {
      // The case must not stay open with no ticket pointing at it.
      await this.handover.withdraw(opened.caseRef);
      throw error;
    }

    await this.staffLog.record(
      agentRef,
      id,
      `Handed ticket ${id} to moderation (report ${opened.caseRef})`,
    );

    const cases = await this.handover.cases([opened.caseRef]);
    const handed = cases.get(opened.caseRef);
    return {
      ...updated,
      escalatedReport: handed ? { id: handed.id, status: handed.status } : null,
    };
  }

  // What support needs to know about who wrote a ticket. It reads; it
  // changes nothing.
  async accountCard(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (!ticket.userId) return null;
    return this.accountCards.accountCard(ticket.userId);
  }
}
