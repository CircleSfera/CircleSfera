import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { MessageReaction } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class AddReactionUseCase {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async execute(
    messageId: string,
    profileId: string,
    reaction: string,
  ): Promise<MessageReaction> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: { participants: true },
        },
      },
    });

    if (!message) {
      throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Message not found');
    }

    const isParticipant = message.conversation.participants.some(
      (p) => p.profileId === profileId,
    );

    if (!isParticipant) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'Not a participant in this conversation',
      );
    }

    const existing = await this.prisma.messageReaction.findUnique({
      where: {
        messageId_profileId: {
          messageId,
          profileId,
        },
      },
    });

    if (existing) {
      if (existing.reaction === reaction) {
        await this.prisma.messageReaction.delete({
          where: { id: existing.id },
        });
        return {
          id: existing.id,
          messageId,
          profileId,
          reaction: null as unknown as string,
          createdAt: existing.createdAt,
        };
      }

      return await this.prisma.messageReaction.update({
        where: { id: existing.id },
        data: { reaction },
      });
    }

    return await this.prisma.messageReaction.create({
      data: {
        messageId,
        profileId,
        reaction,
      },
    });
  }
}
