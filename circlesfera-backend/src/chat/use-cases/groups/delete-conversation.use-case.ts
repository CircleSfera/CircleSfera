import {
  type ChatConversationDeletedEvent,
  ErrorCode,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { LeaveGroupUseCase } from './leave-group.use-case.js';

@Injectable()
export class DeleteConversationUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
    @Inject(LeaveGroupUseCase) private leaveGroup: LeaveGroupUseCase,
  ) {}

  // Deleting a chat removes it from your inbox only (PD-042): the others keep
  // it and every message. In a group it is leaving it, and the group keeps an
  // admin. A conversation is never deleted here: its messages stay out of
  // reach of anyone who is no longer in it.
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
      return this.leaveGroup.execute(profileId, conversationId);
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

    return { success: true };
  }
}
