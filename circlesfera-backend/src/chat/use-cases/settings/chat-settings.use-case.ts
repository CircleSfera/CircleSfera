import {
  CHAT_PINS_MAX,
  type ChatMuteDuration,
  ErrorCode,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

const HOUR_MS = 60 * 60 * 1000;

// "Always" is kept as a date far ahead, so one comparison with now answers
// whether a chat is muted.
export const MUTED_ALWAYS = new Date('9999-12-31T00:00:00.000Z');

export function mutedUntilFor(duration: ChatMuteDuration, now = new Date()) {
  switch (duration) {
    case '1h':
      return new Date(now.getTime() + HOUR_MS);
    case '8h':
      return new Date(now.getTime() + 8 * HOUR_MS);
    case '1w':
      return new Date(now.getTime() + 7 * 24 * HOUR_MS);
    case 'always':
      return MUTED_ALWAYS;
  }
}

// What each member of a chat chooses for themselves: muting it and pinning
// it at the top of their inbox. Nobody else in the chat sees either.
@Injectable()
export class ChatSettingsUseCase {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async mute(
    profileId: string,
    conversationId: string,
    duration: ChatMuteDuration,
  ) {
    const participant = await this.ownRow(profileId, conversationId);
    return this.prisma.participant.update({
      where: { id: participant.id },
      data: { mutedUntil: mutedUntilFor(duration) },
      select: { conversationId: true, mutedUntil: true },
    });
  }

  async unmute(profileId: string, conversationId: string) {
    const participant = await this.ownRow(profileId, conversationId);
    return this.prisma.participant.update({
      where: { id: participant.id },
      data: { mutedUntil: null },
      select: { conversationId: true, mutedUntil: true },
    });
  }

  // A chat of the inbox (not a request) goes to the top, newest pin first.
  // At most CHAT_PINS_MAX at once; pinning one already pinned changes
  // nothing.
  async pin(profileId: string, conversationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.participant.findFirst({
        where: { conversationId, profileId, deletedAt: null },
        select: { id: true, hasAccepted: true, pinnedAt: true },
      });
      if (!participant) throw notFound();
      if (!participant.hasAccepted) {
        throw AppException.BadRequest(
          ErrorCode.BAD_REQUEST,
          'A message request cannot be pinned',
        );
      }
      if (participant.pinnedAt) {
        return { conversationId, pinnedAt: participant.pinnedAt };
      }
      // The Profile is locked so two pins at once cannot pass the limit.
      await tx.$queryRaw`SELECT id FROM "profiles" WHERE id = ${profileId} FOR UPDATE`;
      const pins = await tx.participant.count({
        where: {
          profileId,
          deletedAt: null,
          hasAccepted: true,
          pinnedAt: { not: null },
        },
      });
      if (pins >= CHAT_PINS_MAX) {
        throw AppException.Conflict(
          ErrorCode.CHAT_PINS_FULL,
          `A Profile pins at most ${CHAT_PINS_MAX} chats`,
        );
      }
      return tx.participant.update({
        where: { id: participant.id },
        data: { pinnedAt: new Date() },
        select: { conversationId: true, pinnedAt: true },
      });
    });
  }

  async unpin(profileId: string, conversationId: string) {
    const participant = await this.ownRow(profileId, conversationId);
    return this.prisma.participant.update({
      where: { id: participant.id },
      data: { pinnedAt: null },
      select: { conversationId: true, pinnedAt: true },
    });
  }

  // The member's own row of a chat still in their inbox or requests.
  private async ownRow(profileId: string, conversationId: string) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, profileId, deletedAt: null },
      select: { id: true },
    });
    if (!participant) throw notFound();
    return participant;
  }
}

const notFound = () =>
  AppException.NotFound(ErrorCode.NOT_FOUND, 'Conversation not found');
