import {
  type ChatConversationUpdatedEvent,
  ErrorCode,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ChatAuthorizationService } from '../../services/chat-authorization.service.js';
import { GroupAdminSuccessionService } from '../../services/group-admin-succession.service.js';

@Injectable()
export class RemoveParticipantUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
    @Inject(ChatAuthorizationService)
    private chatAuth: ChatAuthorizationService,
    @Inject(GroupAdminSuccessionService)
    private succession: GroupAdminSuccessionService,
  ) {}

  async execute(
    profileId: string,
    conversationId: string,
    targetProfileId: string,
  ) {
    await this.chatAuth.assertGroupAdmin(
      conversationId,
      profileId,
      'Only group admins can remove participants',
    );

    const targetParticipant = await this.prisma.participant.findFirst({
      where: { conversationId, profileId: targetProfileId },
    });

    if (!targetParticipant) {
      throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Participant not found');
    }

    // An admin who removes themselves leaves the group with an admin.
    await this.prisma.$transaction(async (tx) => {
      await tx.participant.delete({ where: { id: targetParticipant.id } });
      await this.succession.ensureAdmin(conversationId, tx);
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
      const event: ChatConversationUpdatedEvent['payload'] = {
        participants: [...(updated.participants || []), targetParticipant],
        payload: updated,
      };
      this.eventEmitter.emit('chat.conversation.updated', event);
    }

    return updated;
  }
}
