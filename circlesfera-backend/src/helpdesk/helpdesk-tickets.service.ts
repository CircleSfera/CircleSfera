import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  HelpdeskPriority,
  TicketCategory,
  TicketStatus,
} from '@prisma/client';
import { resolvedAtOnStatusChange } from '../common/utils/resolved-at.util.js';
import type { AgentMessageDto } from './dto/agent-message.dto.js';
import type { CreateTicketDto } from './dto/create-ticket.dto.js';
import type { RequesterMessageDto } from './dto/requester-message.dto.js';
import { HelpdeskStore, type TicketEventInput } from './helpdesk.store.js';
import {
  ACCOUNT_CARD_PROVIDER,
  type AccountCardProvider,
  AGENT_DIRECTORY,
  type AgentDirectory,
  HANDOVER_GATEWAY,
  type HandoverGateway,
  REQUESTER_DIRECTORY,
  REQUESTER_NOTIFIER,
  type RequesterDirectory,
  type RequesterNotifier,
  SERVICE_LEVEL_PROVIDER,
  type ServiceLevel,
  type ServiceLevelProvider,
  STAFF_ACTION_LOG,
  type StaffActionLog,
  TEAM_CHANNEL,
  type TeamChannel,
} from './helpdesk-host.contracts.js';
import { HelpdeskReplyAddress } from './helpdesk-reply-address.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// Tickets of the Help Desk: opened by a requester, listed, answered and
// handed to another team by an agent. Its data comes through the store,
// which applies the organization; everything it needs from the product
// around it comes through the host contracts.
@Injectable()
export class HelpdeskTicketsService {
  private readonly logger = new Logger(HelpdeskTicketsService.name);

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
    @Inject(AGENT_DIRECTORY) private readonly agents: AgentDirectory,
    @Inject(HelpdeskReplyAddress)
    private readonly replyAddress: HelpdeskReplyAddress,
    @Inject(SERVICE_LEVEL_PROVIDER)
    private readonly serviceLevels: ServiceLevelProvider,
  ) {}

  // What a ticket opened now by this requester is measured by: its service
  // level, the priority it starts with, and when its first response and its
  // resolution are due. An organization without targets for the level does
  // not measure its tickets.
  private async measuresFor(requesterRef: string | null) {
    const serviceLevel: ServiceLevel = requesterRef
      ? await this.serviceLevels.levelOf(requesterRef).catch(() => 'STANDARD')
      : 'STANDARD';
    const target = await this.store.serviceTarget(serviceLevel);
    const now = Date.now();
    return {
      serviceLevel,
      priority:
        serviceLevel === 'PRIORITY' ? ('HIGH' as const) : ('NORMAL' as const),
      ...(target && {
        firstResponseDueAt: new Date(
          now + target.firstResponseMinutes * MINUTE_MS,
        ),
        resolutionDueAt: new Date(now + target.resolutionMinutes * MINUTE_MS),
      }),
    };
  }

  // The names of the agents these references point to, by reference.
  private async agentNames(refs: (string | null | undefined)[]) {
    const wanted = [...new Set(refs.filter((ref): ref is string => !!ref))];
    if (wanted.length === 0) return {};
    return Object.fromEntries(await this.agents.describe(wanted));
  }

  /** The agents a ticket can be given to. */
  assignableAgents() {
    return this.agents.assignable();
  }

  async createTicket(dto: CreateTicketDto & { email: string; userId: string }) {
    const ticket = await this.store.openTicket({
      requesterRef: dto.userId,
      email: dto.email,
      subject: dto.subject,
      message: dto.message,
      category: dto.category,
      ...(await this.measuresFor(dto.userId)),
    });

    this.teamChannel.ticketOpened(ticket);

    return {
      success: true,
      message: 'Support ticket created successfully',
      ticketId: ticket.id,
    };
  }

  // What a requester may know of their own ticket. Never the organization,
  // the case with another team, or who is assigned.
  private requesterView(ticket: {
    id: string;
    reference: number;
    subject: string;
    category: TicketCategory;
    status: TicketStatus;
    createdAt: Date;
    updatedAt: Date;
    previousTicketId?: string | null;
  }) {
    return {
      id: ticket.id,
      reference: ticket.reference,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      // The closed request this one continues, when there is one.
      previousTicketId: ticket.previousTicketId ?? null,
    };
  }

  private noticeOf(ticket: {
    id: string;
    reference: number;
    subject: string;
    email: string;
    userId: string | null;
  }) {
    return {
      id: ticket.id,
      reference: ticket.reference,
      subject: ticket.subject,
      email: ticket.email,
      requesterRef: ticket.userId,
      replyTo: this.replyAddress.for(ticket),
    };
  }

  // Changes a ticket and records, with the change, each thing that became
  // different and who made it so.
  private change(
    before: {
      id: string;
      status?: TicketStatus;
      category?: TicketCategory;
      priority?: HelpdeskPriority;
      assignedAgentRef?: string | null;
      escalatedReportId?: string | null;
      firstRespondedAt?: Date | null;
      resolutionDueAt?: Date | null;
      pausedAt?: Date | null;
    },
    changes: {
      status?: TicketStatus;
      category?: TicketCategory;
      priority?: HelpdeskPriority;
      assignedAgentRef?: string | null;
      escalatedReportId?: string;
      resolvedAt?: Date | null;
      waitingRemindedAt?: Date | null;
      firstRespondedAt?: Date;
      resolutionDueAt?: Date;
      pausedAt?: Date | null;
    },
    actor: { kind: TicketEventInput['actorKind']; ref: string | null },
    message?: Parameters<HelpdeskStore['updateTicket']>[2],
  ) {
    const events: TicketEventInput[] = [];
    const record = (
      kind: TicketEventInput['kind'],
      from: string | null | undefined,
      to: string | null | undefined,
    ) => {
      if (to === undefined || (from ?? null) === (to ?? null)) return;
      events.push({
        kind,
        fromValue: from ?? null,
        toValue: to ?? null,
        actorKind: actor.kind,
        actorRef: actor.ref,
      });
    };
    record('STATE', before.status, changes.status);
    record('TOPIC', before.category, changes.category);
    record('PRIORITY', before.priority, changes.priority);
    record('ASSIGNMENT', before.assignedAgentRef, changes.assignedAgentRef);
    record('HANDOVER', before.escalatedReportId, changes.escalatedReportId);

    // The times the ticket is measured by move with the change itself, so
    // they can never disagree with its state.
    const now = new Date();
    // The first public answer of an agent, once.
    if (
      before.firstRespondedAt === null &&
      message?.authorKind === 'AGENT' &&
      message.visibility === 'PUBLIC'
    ) {
      changes.firstRespondedAt = now;
    }
    // The resolution clock runs only while the ticket is open: waiting for
    // the requester, with another team, solved or closed, it is stopped.
    // When it runs again its due time moves on by the time it was stopped.
    if (changes.status && before.status && changes.status !== before.status) {
      if (before.status === 'OPEN') {
        changes.pausedAt = now;
      } else if (changes.status === 'OPEN' && before.pausedAt) {
        if (before.resolutionDueAt) {
          changes.resolutionDueAt = new Date(
            before.resolutionDueAt.getTime() +
              (now.getTime() - before.pausedAt.getTime()),
          );
        }
        changes.pausedAt = null;
      }
    }
    return this.store.updateTicket(before.id, changes, message, events);
  }

  private async requesterTicketOrFail(id: string, requesterRef: string) {
    const ticket = await this.store.findRequesterTicket(id, requesterRef);
    // A ticket of someone else does not exist for this requester.
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    return ticket;
  }

  async listMyTickets(requesterRef: string, page = 1, limit = 20) {
    const { tickets, total } = await this.store.listRequesterTickets(
      requesterRef,
      page,
      limit,
    );
    return {
      data: tickets.map((ticket) => this.requesterView(ticket)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  // The requester's view of their ticket: its public messages only.
  async getMyTicket(requesterRef: string, id: string) {
    const ticket = await this.requesterTicketOrFail(id, requesterRef);
    const messages = await this.store.messages(ticket.id, 'PUBLIC');
    return {
      ...this.requesterView(ticket),
      messages: messages.map((message) => ({
        id: message.id,
        // Who of the team answered is not told to the requester.
        authorKind: message.authorKind,
        body: message.body,
        createdAt: message.createdAt,
      })),
    };
  }

  // The requester answers in their own ticket. A solved ticket opens again;
  // a closed one cannot be answered.
  async replyToMyTicket(
    requesterRef: string,
    id: string,
    dto: RequesterMessageDto,
  ) {
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException('The message is empty');
    }
    const ticket = await this.requesterTicketOrFail(id, requesterRef);
    const written = await this.addRequesterMessage(ticket, body, 'PRODUCT');
    return this.getMyTicket(requesterRef, written);
  }

  // The requester answers by email. Who sent it and to which ticket was
  // settled before this is called; the answer then counts exactly as one
  // written in the product. Returns the ticket that holds the message: the
  // same one, or the new one that continues a closed ticket. Nothing when
  // the ticket is gone.
  async replyByEmail(id: string, text: string): Promise<string | null> {
    const body = text.trim();
    const ticket = body ? await this.store.findTicket(id) : null;
    if (!ticket) return null;
    const written = await this.addRequesterMessage(ticket, body, 'EMAIL');
    return written;
  }

  // A note only agents see, written by the system on a ticket.
  async addSystemNote(id: string, body: string): Promise<void> {
    await this.store.updateTicket(
      id,
      {},
      { authorKind: 'SYSTEM', authorRef: null, visibility: 'INTERNAL', body },
    );
  }

  // What the requester wrote becomes a message of their ticket. A solved or
  // waiting ticket opens again; a closed one stays closed and a new ticket
  // continues it. Returns the ticket that holds the message.
  private async addRequesterMessage(
    ticket: {
      id: string;
      reference: number;
      userId: string | null;
      email: string;
      subject: string;
      status: TicketStatus;
      category: TicketCategory;
    },
    body: string,
    channel: 'PRODUCT' | 'EMAIL',
  ): Promise<string> {
    if (ticket.status === 'CLOSED') {
      const subject = ticket.subject.startsWith('Re: ')
        ? ticket.subject
        : `Re: ${ticket.subject}`.slice(0, 100);
      const continued = await this.store.openTicket({
        requesterRef: ticket.userId,
        email: ticket.email,
        subject,
        message: body,
        category: ticket.category,
        previousTicketId: ticket.id,
        channel,
        // A ticket that continues a closed one is measured on its own.
        ...(await this.measuresFor(ticket.userId)),
      });
      this.teamChannel.ticketOpened(continued);
      return continued.id;
    }

    // Their reply ends a wait and reopens a solved ticket.
    const reopened =
      ticket.status === 'RESOLVED' || ticket.status === 'WAITING';
    await this.change(
      ticket,
      reopened
        ? { status: 'OPEN', resolvedAt: null, waitingRemindedAt: null }
        : {},
      { kind: 'REQUESTER', ref: ticket.userId },
      {
        authorKind: 'REQUESTER',
        authorRef: ticket.userId,
        visibility: 'PUBLIC',
        body,
        channel,
      },
    );
    // The team hears of it; a failure to tell them does not undo the reply.
    await this.teamChannel
      .requesterReplied(this.noticeOf(ticket))
      .catch(() => undefined);
    return ticket.id;
  }

  async listTickets(
    page = 1,
    limit = 20,
    status?: string,
    category?: string,
    // Whose tickets: the agent's own, the ones nobody has, or all.
    team: { priority?: string; assignment?: string; agentRef?: string } = {},
  ) {
    const filters: {
      status?: TicketStatus;
      category?: TicketCategory;
      priority?: HelpdeskPriority;
      assignedAgentRef?: string | null;
    } = {};
    if (team.priority && ['LOW', 'NORMAL', 'HIGH'].includes(team.priority)) {
      filters.priority = team.priority as HelpdeskPriority;
    }
    if (team.assignment === 'unassigned') {
      filters.assignedAgentRef = null;
    } else if (team.assignment === 'mine' && team.agentRef) {
      filters.assignedAgentRef = team.agentRef;
    }
    if (
      status &&
      ['OPEN', 'WAITING', 'RESOLVED', 'CLOSED', 'ESCALATED'].includes(status)
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
    const [requesters, cases, agents] = await Promise.all([
      this.requesters.describe(present(tickets.map((t) => t.userId))),
      // Where the ticket stands with the other team, when it was handed over
      this.handover.cases(present(tickets.map((t) => t.escalatedReportId))),
      this.agentNames(tickets.map((t) => t.assignedAgentRef)),
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
      // Who the agents of these tickets are, by reference.
      agents,
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
    const [messages, events, requesters, cases] = await Promise.all([
      this.store.messages(ticket.id),
      this.store.events(ticket.id),
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
      // What changed and who changed it: for agents only.
      events,
      // Who the agents named in the ticket are, by reference.
      agents: await this.agentNames([
        ticket.assignedAgentRef,
        ...messages.map((m) => (m.authorKind === 'AGENT' ? m.authorRef : null)),
        ...events.flatMap((e) => [
          e.actorKind === 'AGENT' ? e.actorRef : null,
          ...(e.kind === 'ASSIGNMENT' ? [e.fromValue, e.toValue] : []),
        ]),
      ]),
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
    const updated = await this.change(
      ticket,
      {
        status,
        ...(resolvedAt !== undefined && { resolvedAt }),
        // A wait starts with no reminder sent.
        waitingRemindedAt: null,
        // Answering a ticket nobody has makes it theirs.
        ...(!ticket.assignedAgentRef && { assignedAgentRef: agentRef }),
      },
      { kind: 'AGENT', ref: agentRef },
      { authorKind: 'AGENT', authorRef: agentRef, visibility: 'PUBLIC', body },
    );

    await this.notifier.answer(this.noticeOf(updated), body);
    await this.staffLog.record(
      agentRef,
      id,
      `Answered ticket ${id} → ${status}`,
    );
    return this.getTicket(id);
  }

  // An answer written in the team's own channel instead of the Help Desk.
  // Who of the team wrote it is not known there, so the message has no
  // author and nothing goes to the staff log. Returns false when the ticket
  // cannot be answered: missing, closed, already solved or with another team.
  async answerFromTeamChannel(id: string, text: string): Promise<boolean> {
    const body = text.trim();
    const ticket = body ? await this.store.findTicket(id) : null;
    if (
      !ticket ||
      ticket.status === 'CLOSED' ||
      ticket.status === 'RESOLVED' ||
      (await this.isHeldByOtherTeam(ticket))
    ) {
      return false;
    }

    const resolvedAt = resolvedAtOnStatusChange(
      'RESOLVED',
      ticket.resolvedAt,
      ['RESOLVED', 'CLOSED'],
      'OPEN',
    );
    const updated = await this.change(
      ticket,
      { status: 'RESOLVED', ...(resolvedAt !== undefined && { resolvedAt }) },
      { kind: 'AGENT', ref: null },
      { authorKind: 'AGENT', authorRef: null, visibility: 'PUBLIC', body },
    );
    await this.notifier.answer(this.noticeOf(updated), body);
    return true;
  }

  async updateTicket(
    agentRef: string,
    id: string,
    data: {
      status?: TicketStatus;
      reply?: string;
      priority?: HelpdeskPriority;
      category?: TicketCategory;
    },
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

    const changes: Parameters<HelpdeskTicketsService['change']>[1] = {
      ...(data.priority && { priority: data.priority }),
      ...(data.category && { category: data.category }),
    };
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
    const ticket = await this.change(
      existing,
      changes,
      { kind: 'AGENT', ref: agentRef },
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
      await this.notifier.answer(this.noticeOf(ticket), answer);
    }

    await this.staffLog.record(
      agentRef,
      id,
      `Updated ticket ${id}${effectiveStatus ? ` → ${effectiveStatus}` : ''}${answer ? ' (replied)' : ''}`,
    );

    return ticket;
  }

  // Who has the ticket. An agent takes a ticket nobody has and lets go of
  // their own; giving a ticket to someone else, or taking it from them, is
  // for who manages the team.
  async assign(
    actor: { ref: string; canManage: boolean },
    id: string,
    agentRef: string | null,
  ) {
    const ticket = await this.ticketOrFail(id);
    const current = ticket.assignedAgentRef;
    const allowed =
      actor.canManage ||
      (agentRef === actor.ref && !current) ||
      (agentRef === null && current === actor.ref);
    if (!allowed && agentRef !== current) {
      throw new ForbiddenException(
        'Only who manages the team can assign a ticket to someone else',
      );
    }
    // A ticket goes only to someone who can answer it.
    if (
      agentRef !== null &&
      agentRef !== current &&
      !(await this.agents.assignable()).some((agent) => agent.ref === agentRef)
    ) {
      throw new BadRequestException('This agent cannot be given tickets');
    }
    const updated = await this.change(
      ticket,
      { assignedAgentRef: agentRef },
      { kind: 'AGENT', ref: actor.ref },
    );
    if (agentRef !== current) {
      await this.staffLog.record(
        actor.ref,
        id,
        `Assigned ticket ${id} to ${agentRef ?? 'nobody'}`,
      );
    }
    return updated;
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
      updated = await this.change(
        ticket,
        { status: 'ESCALATED', escalatedReportId: opened.caseRef },
        { kind: 'AGENT', ref: agentRef },
      );
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

  // Closes the tickets that were solved some days ago and got no reply. A
  // reply reopens a ticket, so a solved one is one nobody answered. Safe to
  // run again.
  async closeSolvedTickets(afterDays = 7, limit = 500): Promise<number> {
    const before = new Date(Date.now() - afterDays * DAY_MS);
    const solved = await this.store.ticketsSolvedBefore(before, limit);
    for (const ticket of solved) {
      await this.change(
        ticket,
        { status: 'CLOSED' },
        { kind: 'SYSTEM', ref: null },
      );
    }
    return solved.length;
  }

  // Reminds, once per wait, the requesters the team has been waiting for.
  // The reminder is marked on the ticket before it is sent, so two runs at
  // once send one; a reminder that could not be sent is unmarked and left
  // for the next run.
  async remindWaitingTickets(
    afterDays = 7,
    solvedInDays = 7,
    limit = 200,
  ): Promise<number> {
    const now = new Date();
    const waiting = await this.store.ticketsWaitingSinceBefore(
      new Date(now.getTime() - afterDays * DAY_MS),
      limit,
    );
    let reminded = 0;
    for (const ticket of waiting) {
      if (!(await this.store.claimReminder(ticket.id, now))) continue;
      try {
        await this.notifier.remind(this.noticeOf(ticket), solvedInDays);
        reminded += 1;
      } catch (err: unknown) {
        await this.store.releaseReminder(ticket.id, now);
        this.logger.warn(
          `Reminder of ticket ${ticket.id} not sent: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }
    return reminded;
  }

  // Solves the tickets whose requester did not answer the reminder either.
  // Safe to run again: a solved ticket no longer waits.
  async solveUnansweredTickets(afterDays = 7, limit = 200): Promise<number> {
    const now = new Date();
    const unanswered = await this.store.ticketsRemindedBefore(
      new Date(now.getTime() - afterDays * DAY_MS),
      limit,
    );
    for (const ticket of unanswered) {
      await this.change(
        ticket,
        { status: 'RESOLVED', resolvedAt: now },
        { kind: 'SYSTEM', ref: null },
      );
    }
    return unanswered.length;
  }

  // Brings back to support the tickets whose case with another team is
  // decided: the ticket is open again and a note for agents says how it
  // ended. A ticket whose case no longer exists comes back too, so that it
  // is never stuck. Safe to run again: a ticket that came back is no longer
  // with the other team.
  async returnDecidedHandovers(limit = 200): Promise<number> {
    const held = await this.store.ticketsWithOtherTeam(limit);
    if (held.length === 0) return 0;

    const cases = await this.handover.cases(
      held
        .map((ticket) => ticket.escalatedReportId)
        .filter((ref): ref is string => !!ref),
    );

    let returned = 0;
    for (const ticket of held) {
      const handed = ticket.escalatedReportId
        ? cases.get(ticket.escalatedReportId)
        : undefined;
      if (handed?.pending) continue;
      await this.change(
        { ...ticket, status: 'ESCALATED' },
        { status: 'OPEN', resolvedAt: null },
        { kind: 'SYSTEM', ref: null },
        {
          authorKind: 'SYSTEM',
          authorRef: null,
          visibility: 'INTERNAL',
          // A key the agent's screen writes in its own language.
          body: `handover.decided:${handed?.status ?? 'GONE'}`,
        },
      );
      returned += 1;
    }
    return returned;
  }

  // What support needs to know about who wrote a ticket. It reads; it
  // changes nothing.
  async accountCard(id: string) {
    const ticket = await this.ticketOrFail(id);
    if (!ticket.userId) return null;
    return this.accountCards.accountCard(ticket.userId);
  }
}
