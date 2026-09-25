import {
  type ChatConversationDeletedEvent,
  ErrorCode,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class DeleteConversationUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
  ) {}

  async execute(profileId: string, conversationId: string) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, profileId },
      include: { conversation: { include: { participants: true } } },
    });

    if (!participant) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'Not a participant in this conversation',
      );
    }

    if (participant.conversation.isGroup) {
      if (!participant.isAdmin) {
        throw AppException.Forbidden(
          ErrorCode.FORBIDDEN_ACCESS,
          'Only group admins can delete the group',
        );
      }
      await this.prisma.conversation.delete({
        where: { id: conversationId },
      });

      const event: ChatConversationDeletedEvent['payload'] = {
        participants: participant.conversation.participants,
        payload: { conversationId },
      };
      this.eventEmitter.emit('chat.conversation.deleted', event);

      return { success: true };
    }

    await this.prisma.participant.update({
      where: { id: participant.id },
      data: {
        deletedAt: new Date(),
        clearedAt: new Date(),
      },
    });

    const leaveEvent: ChatConversationDeletedEvent['payload'] = {
      participants: [{ profileId }],
      payload: { conversationId },
    };
    this.eventEmitter.emit('chat.conversation.deleted', leaveEvent);

    const allDeleted = await this.prisma.participant.findMany({
      where: { conversationId, deletedAt: null },
    });

    if (allDeleted.length === 0) {
      await this.prisma.conversation.delete({
        where: { id: conversationId },
      });
    }

    return { success: true };
  }
}
