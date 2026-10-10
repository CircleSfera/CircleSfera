import { Inject, Injectable } from '@nestjs/common';
import type {
  HelpdeskInboundOutcome,
  HelpdeskMessageVisibility,
  Prisma,
  TicketCategory,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ORGANIZATION_SCOPE,
  type OrganizationScope,
} from './helpdesk-host.contracts.js';

/** What makes an open ticket be past its target at a moment. */
const pastTarget = (moment: Date): Prisma.SupportTicketWhereInput => ({
  status: 'OPEN',
  OR: [
    // Not answered yet, and the first response is late.
    { firstRespondedAt: null, firstResponseDueAt: { lt: moment } },
    { resolutionDueAt: { lt: moment } },
  ],
});

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
    // Nobody when the requester no longer exists for the host.
    requesterRef: string | null;
    email: string;
    subject: string;
    message: string;
    category?: TicketCategory;
    // The closed ticket this one continues.
    previousTicketId?: string;
    // How the first message arrived; in the product unless said.
    channel?: 'PRODUCT' | 'EMAIL';
    // What the ticket is measured by. Without due times it is not measured.
    serviceLevel?: 'STANDARD' | 'PRIORITY';
    priority?: 'LOW' | 'NORMAL' | 'HIGH';
    firstResponseDueAt?: Date;
    resolutionDueAt?: Date;
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
        serviceLevel: ticket.serviceLevel,
        priority: ticket.priority,
        firstResponseDueAt: ticket.firstResponseDueAt,
        resolutionDueAt: ticket.resolutionDueAt,
        messages: {
          create: {
            authorKind: 'REQUESTER',
            authorRef: ticket.requesterRef,
            body: ticket.message,
            ...(ticket.channel && { channel: ticket.channel }),
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
      select: {
        id: true,
        escalatedReportId: true,
        resolutionDueAt: true,
        pausedAt: true,
      },
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
        // What they thought of the answer is theirs too.
        rating: { select: { score: true, comment: true, updatedAt: true } },
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
    // The list of open tickets: what to answer next comes first.
    openList: boolean,
    // Only the open tickets whose next target passed before this moment.
    pastTargetAt?: Date,
  ) {
    const where: Prisma.SupportTicketWhereInput = {
      ...filters,
      organizationId: this.organizationId,
      ...(pastTargetAt && pastTarget(pastTargetAt)),
    };
    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        // Open tickets: high priority first, and inside each priority the
        // one waiting longest. Any other list: newest first.
        orderBy: openList
          ? [{ priority: 'desc' }, { createdAt: 'asc' }]
          : { createdAt: 'desc' },
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
      // How it arrived; in the product unless said.
      channel?: 'PRODUCT' | 'EMAIL';
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

  /** What changed in a ticket and who changed it, oldest first. */
  events(ticketId: string) {
    return this.prisma.helpdeskTicketEvent.findMany({
      where: { ticketId, ticket: { organizationId: this.organizationId } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        kind: true,
        fromValue: true,
        toValue: true,
        actorKind: true,
        actorRef: true,
        createdAt: true,
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

  /** The saved replies an agent may use: the shared ones and their own. */
  savedRepliesFor(agentRef: string) {
    return this.prisma.helpdeskSavedReply.findMany({
      where: {
        organizationId: this.organizationId,
        OR: [{ ownerRef: null }, { ownerRef: agentRef }],
      },
      orderBy: { title: 'asc' },
    });
  }

  /** A saved reply of the organization, whoever owns it, or nothing. */
  findSavedReply(id: string) {
    return this.prisma.helpdeskSavedReply.findFirst({
      where: { id, organizationId: this.organizationId },
    });
  }

  createSavedReply(reply: {
    title: string;
    body: string;
    // Nobody: shared with the team.
    ownerRef: string | null;
  }) {
    return this.prisma.helpdeskSavedReply.create({
      data: {
        organizationId: this.organizationId,
        title: reply.title,
        body: reply.body,
        ownerRef: reply.ownerRef,
      },
    });
  }

  /** Changes the words of a saved reply; never whose it is. */
  async updateSavedReply(
    id: string,
    changes: { title?: string; body?: string },
  ) {
    const { count } = await this.prisma.helpdeskSavedReply.updateMany({
      where: { id, organizationId: this.organizationId },
      data: {
        ...(changes.title !== undefined && { title: changes.title }),
        ...(changes.body !== undefined && { body: changes.body }),
      },
    });
    return count === 1 ? this.findSavedReply(id) : null;
  }

  async deleteSavedReply(id: string): Promise<boolean> {
    const { count } = await this.prisma.helpdeskSavedReply.deleteMany({
      where: { id, organizationId: this.organizationId },
    });
    return count === 1;
  }

  /**
   * Keeps an email that arrived, once: the same Message-ID in the
   * organization is the same email. Says whether it is new.
   */
  async keepInboundEmail(email: {
    messageId: string;
    fromAddress: string;
    toAddress: string;
    subject: string;
    body: string;
    spamScore: number | null;
    attachmentCount: number;
    automated: boolean;
  }): Promise<{ id: string; kept: boolean }> {
    const where = {
      organizationId_messageId: {
        organizationId: this.organizationId,
        messageId: email.messageId,
      },
    };
    const before = await this.prisma.helpdeskInboundEmail.findUnique({
      where,
      select: { id: true },
    });
    if (before) return { id: before.id, kept: false };
    try {
      const created = await this.prisma.helpdeskInboundEmail.create({
        data: { organizationId: this.organizationId, ...email },
        select: { id: true },
      });
      return { id: created.id, kept: true };
    } catch (err: unknown) {
      // Delivered twice at the same moment: the other one kept it.
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const other = await this.prisma.helpdeskInboundEmail.findUniqueOrThrow({
        where,
        select: { id: true },
      });
      return { id: other.id, kept: false };
    }
  }

  /** Deletes the emails that arrived before a moment. */
  async deleteInboundEmailsBefore(moment: Date): Promise<number> {
    const { count } = await this.prisma.helpdeskInboundEmail.deleteMany({
      where: {
        organizationId: this.organizationId,
        receivedAt: { lt: moment },
      },
    });
    return count;
  }

  /** The ticket of the organization with this number, or nothing. */
  findTicketByReference(reference: number) {
    return this.prisma.supportTicket.findFirst({
      where: { reference, organizationId: this.organizationId },
    });
  }

  /** A kept email of the organization, or nothing. */
  findInboundEmail(id: string) {
    return this.prisma.helpdeskInboundEmail.findFirst({
      where: { id, organizationId: this.organizationId },
    });
  }

  /** The kept emails nobody has looked at yet, the oldest first. */
  pendingInboundEmails(limit: number) {
    return this.prisma.helpdeskInboundEmail.findMany({
      where: { organizationId: this.organizationId, outcome: 'RECEIVED' },
      orderBy: { receivedAt: 'asc' },
      take: limit,
      select: { id: true },
    });
  }

  /**
   * Says what became of a kept email, once: false when it already had an
   * outcome, so that two runs do not both act on it.
   */
  async decideInboundEmail(
    id: string,
    outcome: Exclude<HelpdeskInboundOutcome, 'RECEIVED'>,
    ticketId?: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.helpdeskInboundEmail.updateMany({
      where: { id, organizationId: this.organizationId, outcome: 'RECEIVED' },
      data: { outcome, ...(ticketId && { ticketId }) },
    });
    return count === 1;
  }

  /** Takes back a match whose message could not be written. */
  async undoInboundMatch(id: string): Promise<void> {
    await this.prisma.helpdeskInboundEmail.updateMany({
      where: { id, organizationId: this.organizationId, outcome: 'MATCHED' },
      data: { outcome: 'RECEIVED', ticketId: null },
    });
  }

  /** Whether a sender was already told, since a moment, that an email of theirs matched nothing. */
  async senderToldSince(fromAddress: string, moment: Date): Promise<boolean> {
    const told = await this.prisma.helpdeskInboundEmail.count({
      where: {
        organizationId: this.organizationId,
        fromAddress,
        noticeSentAt: { gte: moment },
      },
    });
    return told > 0;
  }

  async markSenderTold(id: string, moment: Date): Promise<void> {
    await this.prisma.helpdeskInboundEmail.updateMany({
      where: { id, organizationId: this.organizationId },
      data: { noticeSentAt: moment },
    });
  }

  /** How many emails that arrived since a moment had each outcome. */
  async inboundOutcomesSince(
    moment: Date,
  ): Promise<Partial<Record<HelpdeskInboundOutcome, number>>> {
    const groups = await this.prisma.helpdeskInboundEmail.groupBy({
      by: ['outcome'],
      where: {
        organizationId: this.organizationId,
        receivedAt: { gte: moment },
      },
      _count: { _all: true },
    });
    return Object.fromEntries(
      groups.map((group) => [group.outcome, group._count._all]),
    );
  }

  /** How many emails kept before a moment nobody has looked at yet. */
  inboundStuckBefore(moment: Date): Promise<number> {
    return this.prisma.helpdeskInboundEmail.count({
      where: {
        organizationId: this.organizationId,
        outcome: 'RECEIVED',
        receivedAt: { lt: moment },
      },
    });
  }

  /** The targets of the organization for a service level, or nothing. */
  serviceTarget(serviceLevel: 'STANDARD' | 'PRIORITY') {
    return this.prisma.helpdeskServiceTarget.findUnique({
      where: {
        organizationId_serviceLevel: {
          organizationId: this.organizationId,
          serviceLevel,
        },
      },
      select: { firstResponseMinutes: true, resolutionMinutes: true },
    });
  }

  /** What the requester thought of the answer of a ticket, or nothing. */
  rating(ticketId: string) {
    return this.prisma.helpdeskRating.findFirst({
      where: { ticketId, organizationId: this.organizationId },
      select: { score: true, comment: true, updatedAt: true },
    });
  }

  /** Stores the rating of a ticket: one per ticket, the last one given. */
  rate(ticketId: string, score: 'GOOD' | 'BAD', comment: string | null) {
    return this.prisma.helpdeskRating.upsert({
      where: { ticketId },
      create: {
        organizationId: this.organizationId,
        ticketId,
        score,
        comment,
      },
      update: { score, comment },
      select: { score: true, comment: true, updatedAt: true },
    });
  }

  /** How many open tickets are past their target at a moment. */
  countPastTarget(moment: Date): Promise<number> {
    return this.prisma.supportTicket.count({
      where: { organizationId: this.organizationId, ...pastTarget(moment) },
    });
  }

  /** The times and the state of the tickets opened since a moment. Nothing written by anyone. */
  measuredTicketsSince(moment: Date) {
    return this.prisma.supportTicket.findMany({
      where: {
        organizationId: this.organizationId,
        createdAt: { gte: moment },
      },
      select: {
        serviceLevel: true,
        status: true,
        createdAt: true,
        firstResponseDueAt: true,
        firstRespondedAt: true,
        resolutionDueAt: true,
        resolvedAt: true,
      },
    });
  }

  /** The ratings of tickets opened since a moment: the score and the level, not the comment. */
  ratingsSince(moment: Date) {
    return this.prisma.helpdeskRating.findMany({
      where: {
        organizationId: this.organizationId,
        ticket: { createdAt: { gte: moment } },
      },
      select: { score: true, ticket: { select: { serviceLevel: true } } },
    });
  }

  // --- the help centre ---

  /** The languages an article must have to be published. */
  async organizationLocales(): Promise<string[]> {
    const organization = await this.prisma.helpdeskOrganization.findUnique({
      where: { id: this.organizationId },
      select: { locales: true },
    });
    return organization?.locales ?? [];
  }

  /** Every article of the organization, drafts included, for who writes them. */
  articles() {
    return this.prisma.helpdeskArticle.findMany({
      where: { organizationId: this.organizationId },
      orderBy: [{ topic: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      include: { texts: { select: { locale: true, title: true } } },
    });
  }

  /** One article of the organization with all its texts, or nothing. */
  findArticle(id: string) {
    return this.prisma.helpdeskArticle.findFirst({
      where: { id, organizationId: this.organizationId },
      include: {
        texts: { select: { locale: true, title: true, body: true } },
      },
    });
  }

  createArticle(article: {
    slug: string;
    topic: TicketCategory;
    position: number;
    authorRef: string;
    texts: { locale: string; title: string; body: string }[];
  }) {
    return this.prisma.helpdeskArticle.create({
      data: {
        organizationId: this.organizationId,
        slug: article.slug,
        topic: article.topic,
        position: article.position,
        authorRef: article.authorRef,
        texts: { create: article.texts },
      },
      select: { id: true },
    });
  }

  /**
   * Changes the topic and the place of an article and writes the texts
   * given, each in its language. Never its address, its organization or its
   * state. False when the article is not of the organization.
   */
  async updateArticle(
    id: string,
    changes: { topic?: TicketCategory; position?: number },
    texts: { locale: string; title: string; body: string }[],
  ): Promise<boolean> {
    // All or nothing: a text that cannot be written leaves the article as
    // it was, and not half edited.
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.helpdeskArticle.updateMany({
        where: { id, organizationId: this.organizationId },
        data: {
          ...(changes.topic !== undefined && { topic: changes.topic }),
          ...(changes.position !== undefined && {
            position: changes.position,
          }),
          // The article changed even when only a text did.
          updatedAt: new Date(),
        },
      });
      if (count !== 1) return false;
      for (const text of texts) {
        await tx.helpdeskArticleText.upsert({
          where: { articleId_locale: { articleId: id, locale: text.locale } },
          create: { articleId: id, ...text },
          update: { title: text.title, body: text.body },
        });
      }
      return true;
    });
  }

  /** Publishes an article or takes it back. False when it is not of the organization. */
  async setArticleStatus(
    id: string,
    status: 'DRAFT' | 'PUBLISHED',
    moment: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.helpdeskArticle.updateMany({
      where: { id, organizationId: this.organizationId },
      data: {
        status,
        ...(status === 'PUBLISHED' && { publishedAt: moment }),
      },
    });
    return count === 1;
  }

  /** Deletes a draft with its texts. False when there is no such draft. */
  async deleteDraftArticle(id: string): Promise<boolean> {
    const { count } = await this.prisma.helpdeskArticle.deleteMany({
      where: { id, organizationId: this.organizationId, status: 'DRAFT' },
    });
    return count === 1;
  }

  /**
   * The published articles in one language, for anyone: the address, the
   * topic and the title. With words to look for, the ones that have them in
   * the title or the body.
   */
  publishedArticles(
    locale: string,
    filters: { search?: string; topic?: TicketCategory },
    limit: number,
  ) {
    const words = filters.search;
    return this.prisma.helpdeskArticle.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'PUBLISHED',
        ...(filters.topic && { topic: filters.topic }),
        texts: {
          some: {
            locale,
            ...(words && {
              OR: [
                { title: { contains: words, mode: 'insensitive' } },
                { body: { contains: words, mode: 'insensitive' } },
              ],
            }),
          },
        },
      },
      orderBy: [{ topic: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      select: {
        slug: true,
        topic: true,
        texts: { where: { locale }, select: { title: true } },
      },
    });
  }

  /** One published article in one language, by its address, or nothing. */
  publishedArticle(slug: string, locale: string) {
    return this.prisma.helpdeskArticle.findFirst({
      where: {
        slug,
        organizationId: this.organizationId,
        status: 'PUBLISHED',
        texts: { some: { locale } },
      },
      select: {
        slug: true,
        topic: true,
        updatedAt: true,
        texts: { where: { locale }, select: { title: true, body: true } },
      },
    });
  }

  /**
   * Adds one to the readers who found a published article useful, or not.
   * In one statement, so two answers at once are both counted. False when
   * there is no such published article.
   */
  async countArticleFeedback(slug: string, useful: boolean): Promise<boolean> {
    const { count } = await this.prisma.helpdeskArticle.updateMany({
      where: { slug, organizationId: this.organizationId, status: 'PUBLISHED' },
      data: useful
        ? { usefulYes: { increment: 1 } }
        : { usefulNo: { increment: 1 } },
    });
    return count === 1;
  }
}
