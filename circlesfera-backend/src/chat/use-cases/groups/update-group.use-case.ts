import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class UpdateGroupUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
  ) {}

  async execute(
    profileId: string,
    conversationId: string,
    name?: string,
    avatarUrl?: string,
  ) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, profileId },
    });

    if (!participant?.isAdmin) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'Only group admins can update the group details',
      );
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data,
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

    this.eventEmitter.emit('chat.conversation.updated', {
      participants: updated.participants || [],
      payload: updated,
    });

    return updated;
  }
}
