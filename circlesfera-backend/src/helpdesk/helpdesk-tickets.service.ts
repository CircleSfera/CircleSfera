import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TicketCategory, TicketStatus } from '@prisma/client';
import { resolvedAtOnStatusChange } from '../common/utils/resolved-at.util.js';
import type { AgentMessageDto } from './dto/agent-message.dto.js';
import type { CreateTicketDto } from './dto/create-ticket.dto.js';
import { HelpdeskStore } from './helpdesk.store.js';
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
// handed to another team by an agent. Its data comes through the store,
// which applies the organization; everything it needs from the product
// around it comes through the host contracts.
@Injectable()
export class HelpdeskTicketsService {
  constructor(
    @Inject(HelpdeskStore) private readonly store: HelpdeskStore,
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
    const ticket = await this.store.openTicket({
      requesterRef: dto.userId,
      email: dto.email,
      subject: dto.subject,
      message: dto.message,
      category: dto.category,
    });

    this.teamChannel.ticketOpened(ticket);

    return {
      success: true,
      message: 'Support ticket created successfully',
      ticketId: ticket.id,
    };
  }

  async listTickets(page = 1, limit = 20, status?: string, category?: string) {
    const filters: { status?: TicketStatus; category?: TicketCategory } = {};
    if (
      status &&
      ['OPEN', 'RESOLVED', 'CLOSED', 'ESCALATED'].includes(status)
    ) {
      filters.status = status as TicketStatus;
    }
    if (
      category &&
      ['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'].includes(category)
    ) {
      filters.category = category as TicketCategory;
    }

    // Open tickets: the one waiting longest first. Any other list: newest first.
    const { tickets, total } = await this.store.listTickets(
      filters,
      page,
      limit,
      filters.status === 'OPEN',
    );

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

  private async ticketOrFail(id: string) {
    const ticket = await this.store.findTicket(id);
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    return ticket;
  }

  // Whether the ticket is with another team that has not decided yet.
  private async isHeldByOtherTeam(ticket: {
    status: TicketStatus;
    escalatedReportId: string | null;
  }) {
    if (ticket.status !== 'ESCALATED' || !ticket.escalatedReportId) {
      return false;
    }
    const cases = await this.handover.cases([ticket.escalatedReportId]);
    return !!cases.get(ticket.escalatedReportId)?.pending;
  }

  // One ticket with its whole conversation, internal notes included: this is
  // the agent's view.
  async getTicket(id: string) {
    const ticket = await this.ticketOrFail(id);
    const [messages, requesters, cases] = await Promise.all([
      this.store.messages(ticket.id),
      this.requesters.describe(ticket.userId ? [ticket.userId] : []),
      this.handover.cases(
        ticket.escalatedReportId ? [ticket.escalatedReportId] : [],
      ),
    ]);
    const handed = ticket.escalatedReportId
      ? cases.get(ticket.escalatedReportId)
      : undefined;
    return {
      ...ticket,
      user: (ticket.userId && requesters.get(ticket.userId)) || null,
      escalatedReport: handed ? { id: handed.id, status: handed.status } : null,
      messages,
    };
  }

  // An agent adds to the conversation: an answer the requester receives, or
  // an internal note only agents see.
  async addMessage(agentRef: string, id: string, dto: AgentMessageDto) {
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException('The message is empty');
    }
    const ticket = await this.ticketOrFail(id);

    if (dto.visibility === 'INTERNAL') {
      // A note changes nothing else and tells nobody.
      await this.store.updateTicket(
        id,
        {},
        {
          authorKind: 'AGENT',
          authorRef: agentRef,
          visibility: 'INTERNAL',
          body,
        },
      );
      await this.staffLog.record(agentRef, id, `Added a note to ticket ${id}`);
      return this.getTicket(id);
    }

    if (ticket.status === 'CLOSED') {
      throw new ConflictException('A closed ticket cannot be answered');
    }
    if (await this.isHeldByOtherTeam(ticket)) {
      throw new ConflictException(
        'This ticket is with moderation until its report is decided',
      );
    }

    const status = dto.status ?? 'RESOLVED';
    const resolvedAt = resolvedAtOnStatusChange(
      status,
      ticket.resolvedAt,
      ['RESOLVED', 'CLOSED'],
      'OPEN',
    );
    const updated = await this.store.updateTicket(
      id,
      { status, ...(resolvedAt !== undefined && { resolvedAt }) },
      { authorKind: 'AGENT', authorRef: agentRef, visibility: 'PUBLIC', body },
    );

    await this.notifier.answer(updated, body);
    await this.staffLog.record(
      agentRef,
      id,
      `Answered ticket ${id} → ${status}`,
    );
    return this.getTicket(id);
  }

  async updateTicket(
    agentRef: string,
    id: string,
    data: { status?: TicketStatus; reply?: string },
  ) {
    const existing = await this.ticketOrFail(id);

    // A ticket handed to another team is theirs until they decide its case;
    // support cannot answer or close it meanwhile.
    if (await this.isHeldByOtherTeam(existing)) {
      throw new ConflictException(
        'This ticket is with moderation until its report is decided',
      );
    }

    const answer = data.reply?.trim();
    const effectiveStatus =
      data.status ??
      (answer && existing.status === 'OPEN' ? 'RESOLVED' : undefined);

    const changes: { status?: TicketStatus; resolvedAt?: Date | null } = {};
    if (effectiveStatus) {
      changes.status = effectiveStatus;
      const resolvedAt = resolvedAtOnStatusChange(
        effectiveStatus,
        existing.resolvedAt,
        ['RESOLVED', 'CLOSED'],
        'OPEN',
      );
      if (resolvedAt !== undefined) {
        changes.resolvedAt = resolvedAt;
      }
    }

    // An answer sent this way is a message of the conversation, like any
    // other; the ticket's own reply field is no longer written.
    const ticket = await this.store.updateTicket(
      id,
      changes,
      answer
        ? {
            authorKind: 'AGENT',
            authorRef: agentRef,
            visibility: 'PUBLIC',
            body: answer,
          }
        : undefined,
    );

    if (answer) {
      await this.notifier.answer(ticket, answer);
    }

    await this.staffLog.record(
      agentRef,
      id,
      `Updated ticket ${id}${effectiveStatus ? ` → ${effectiveStatus}` : ''}${answer ? ' (replied)' : ''}`,
    );

    return ticket;
  }

  // Hands a ticket to another team: a case is opened there, linked to the
  // ticket, and the ticket is marked as being with them.
  async handOver(agentRef: string, id: string) {
    const ticket = await this.ticketOrFail(id);
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

    let updated: Awaited<ReturnType<HelpdeskStore['updateTicket']>>;
    try {
      updated = await this.store.updateTicket(id, {
        status: 'ESCALATED',
        escalatedReportId: opened.caseRef,
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
    const ticket = await this.ticketOrFail(id);
    if (!ticket.userId) return null;
    return this.accountCards.accountCard(ticket.userId);
  }
}
