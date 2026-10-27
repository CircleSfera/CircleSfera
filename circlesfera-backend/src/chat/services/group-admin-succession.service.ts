import { type ChatMessageSentEvent, ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type Client = Pick<
  Prisma.TransactionClient,
  'conversation' | 'participant' | 'message'
>;

// What a notice carries to the people in the group: the same shape as a
// message of the conversation, with its subject as the sender.
const NOTICE_INCLUDE = {
  sender: { select: { id: true, username: true, avatar: true } },
} satisfies Prisma.MessageInclude;

export type AdminNotice = Prisma.MessageGetPayload<{
  include: typeof NOTICE_INCLUDE;
}>;

/**
 * A member who may be a group admin: still in the group, accepted it, and
 * has an active account: not deactivated, banned, suspended nor being erased.
 */
export function mayBeGroupAdmin(
  conversationId: string,
  now: Date,
): Prisma.ParticipantWhereInput {
  return {
    conversationId,
    hasAccepted: true,
    deletedAt: null,
    conversation: { isGroup: true },
    profile: {
      isAccountBanned: false,
      OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
      user: {
        isActive: true,
        isRootBanned: false,
        deletedAt: null,
        scheduledDeletionAt: null,
      },
    },
  };
}

// Makes the member admin and writes the notice that says so, in the same
// client (a transaction when called from one). Null when the member left at
// this very moment. The notice's content is empty: encrypting an empty
// string gives an empty string, and each reader writes the notice out in
// their own language from its kind and its sender.
async function promote(
  client: Client,
  conversationId: string,
  participant: { id: string; profileId: string },
): Promise<AdminNotice | null> {
  const promoted = await client.participant.updateMany({
    where: { id: participant.id, deletedAt: null },
    data: { isAdmin: true },
  });
  if (promoted.count === 0) return null;
  return client.message.create({
    data: {
      conversationId,
      senderId: participant.profileId,
      content: '',
      kind: 'ADMIN_GRANTED',
    },
    include: NOTICE_INCLUDE,
  });
}

/**
 * A group never stays without an admin: when its last admin goes (leaves,
 * removes it from their inbox, is removed, or their account is erased), the
 * member who has been in it longest becomes admin, and the group is told.
 *
 * Names an admin for a group that has none left, and answers the notice
 * that says who; null when the group still has an admin, is not a group, or
 * has no member who may be one. Ties go to the lowest participant id, never
 * at random. A plain function, so that account erasure can run it in its
 * transaction.
 */
export async function ensureGroupAdmin(
  client: Client,
  conversationId: string,
  now: Date = new Date(),
): Promise<AdminNotice | null> {
  const conversation = await client.conversation.findUnique({
    where: { id: conversationId },
    select: { isGroup: true },
  });
  if (!conversation?.isGroup) return null;

  const hasAdmin = await client.participant.count({
    where: {
      conversationId,
      hasAccepted: true,
      deletedAt: null,
      isAdmin: true,
    },
  });
  if (hasAdmin > 0) return null;

  // A candidate who leaves at this very moment is passed over for the next
  // one, rather than failing the leave that asked for a successor.
  const passedOver: string[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await client.participant.findFirst({
      where: {
        ...mayBeGroupAdmin(conversationId, now),
        ...(passedOver.length > 0 ? { id: { notIn: passedOver } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, profileId: true },
    });
    if (!next) return null;

    const notice = await promote(client, conversationId, next);
    if (notice) return notice;
    passedOver.push(next.id);
  }
  return null;
}

/**
 * Makes a member of a group its admin, chosen by an admin. Refused when the
 * member may not be one (see mayBeGroupAdmin). Answers the notice that says
 * so, or null when the member was admin already: nothing changes then.
 */
export async function grantGroupAdmin(
  client: Client,
  conversationId: string,
  profileId: string,
  now: Date = new Date(),
): Promise<AdminNotice | null> {
  const target = await client.participant.findFirst({
    where: { ...mayBeGroupAdmin(conversationId, now), profileId },
    select: { id: true, profileId: true, isAdmin: true },
  });
  if (!target) throw notEligible();
  if (target.isAdmin) return null;

  const notice = await promote(client, conversationId, target);
  if (!notice) throw notEligible();
  return notice;
}

function notEligible() {
  return AppException.BadRequest(
    ErrorCode.GROUP_ADMIN_NOT_ELIGIBLE,
    'This member cannot be an admin of the group',
  );
}

/**
 * Tells the people in the group, over the same real-time path as any
 * message, that someone is now admin. Called after the transaction that
 * wrote the notice commits. A notice sends no push notification.
 */
export async function announceAdminNotices(
  client: Pick<Prisma.TransactionClient, 'participant'>,
  events: EventEmitter2,
  notices: (AdminNotice | null | undefined)[],
): Promise<void> {
  for (const notice of notices) {
    if (!notice) continue;
    const participants = await client.participant.findMany({
      where: { conversationId: notice.conversationId },
      select: { profileId: true },
    });
    const event: ChatMessageSentEvent['payload'] = {
      participants,
      payload: notice,
    };
    events.emit('chat.message.sent', event);
  }
}

@Injectable()
export class GroupAdminSuccessionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  ensureAdmin(
    conversationId: string,
    client: Client = this.prisma,
    now: Date = new Date(),
  ): Promise<AdminNotice | null> {
    return ensureGroupAdmin(client, conversationId, now);
  }

  grantAdmin(
    conversationId: string,
    profileId: string,
    client: Client = this.prisma,
    now: Date = new Date(),
  ): Promise<AdminNotice | null> {
    return grantGroupAdmin(client, conversationId, profileId, now);
  }

  announce(notices: (AdminNotice | null | undefined)[]): Promise<void> {
    return announceAdminNotices(this.prisma, this.events, notices);
  }
}
