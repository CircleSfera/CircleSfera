import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ChatAuthorizationService } from '../../services/chat-authorization.service.js';

@Injectable()
export class RemoveParticipantUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
    @Inject(ChatAuthorizationService)
    private chatAuth: ChatAuthorizationService,
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

    await this.prisma.participant.delete({
      where: { id: targetParticipant.id },
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
      this.eventEmitter.emit('chat.conversation.updated', {
        participants: [...(updated.participants || []), targetParticipant],
        payload: updated,
      });
    }

    return updated;
  }
}
