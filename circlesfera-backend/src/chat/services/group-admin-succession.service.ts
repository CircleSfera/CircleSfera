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
 * accepted it, and has an active account: not deactivated, banned,
 * suspended nor being erased. Ties go to the lowest participant id, never at random. A
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

  // A candidate who leaves at this very moment is passed over for the next
  // one, rather than failing the leave that asked for a successor.
  const passedOver: string[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await client.participant.findFirst({
      where: {
        ...inGroup,
        ...(passedOver.length > 0 ? { id: { notIn: passedOver } } : {}),
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
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, profileId: true },
    });
    if (!next) return null;

    const promoted = await client.participant.updateMany({
      where: { id: next.id, deletedAt: null },
      data: { isAdmin: true },
    });
    if (promoted.count > 0) return next.profileId;
    passedOver.push(next.id);
  }
  return null;
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
