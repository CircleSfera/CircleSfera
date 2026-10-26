import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

type Client = Pick<Prisma.TransactionClient, 'conversation' | 'participant'>;

/**
 * A group never stays without an admin (PD-042): when its last admin goes
 * (leaves, removes it from their inbox, is removed, or their account is
 * erased), the member who has been in it longest becomes admin.
 *
 * Names an admin for a group that has none left, and answers the Profile
 * named; null when the group still has an admin, is not a group, or has no
 * member who may be one. A member who may be one is still in the group,
 * accepted it, and has an account that is neither banned, suspended nor
 * being erased. Ties go to the lowest participant id, never at random. A
 * plain function, so that account erasure can run it in its transaction.
 */
export async function ensureGroupAdmin(
  client: Client,
  conversationId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const conversation = await client.conversation.findUnique({
    where: { id: conversationId },
    select: { isGroup: true },
  });
  if (!conversation?.isGroup) return null;

  const inGroup = { conversationId, hasAccepted: true, deletedAt: null };
  const hasAdmin = await client.participant.count({
    where: { ...inGroup, isAdmin: true },
  });
  if (hasAdmin > 0) return null;

  const next = await client.participant.findFirst({
    where: {
      ...inGroup,
      profile: {
        isAccountBanned: false,
        OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
        user: {
          isRootBanned: false,
          deletedAt: null,
          scheduledDeletionAt: null,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, profileId: true },
  });
  if (!next) return null;

  await client.participant.update({
    where: { id: next.id },
    data: { isAdmin: true },
  });
  return next.profileId;
}

@Injectable()
export class GroupAdminSuccessionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  ensureAdmin(
    conversationId: string,
    client: Client = this.prisma,
    now: Date = new Date(),
  ): Promise<string | null> {
    return ensureGroupAdmin(client, conversationId, now);
  }
}
