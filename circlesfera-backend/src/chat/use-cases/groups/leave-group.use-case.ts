import {
  type ChatConversationDeletedEvent,
  type ChatConversationUpdatedEvent,
  ErrorCode,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class LeaveGroupUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
  ) {}

  async execute(profileId: string, conversationId: string) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, profileId },
    });

    if (!participant) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'You are not a participant in this conversation',
      );
    }

    await this.prisma.participant.delete({
      where: { id: participant.id },
    });

    const updated = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            profile: {
              select: {
                id: true,
                username: true,
                avatar: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (updated) {
      const updatedEvent: ChatConversationUpdatedEvent['payload'] = {
        participants: updated.participants || [],
        payload: updated,
      };
      this.eventEmitter.emit('chat.conversation.updated', updatedEvent);
    }

    const deletedEvent: ChatConversationDeletedEvent['payload'] = {
      participants: [{ profileId }],
      payload: { conversationId },
    };
    this.eventEmitter.emit('chat.conversation.deleted', deletedEvent);

    return { success: true };
  }
}
