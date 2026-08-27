import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AppGateway } from '../../../socket/app.gateway.js';

@Injectable()
export class RemoveParticipantUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ModuleRef) private moduleRef: ModuleRef,
  ) {}

  private get gateway(): AppGateway {
    return this.moduleRef.get(AppGateway, { strict: false });
  }

  async execute(
    profileId: string,
    conversationId: string,
    targetProfileId: string,
  ) {
    const admin = await this.prisma.participant.findFirst({
      where: { conversationId, profileId },
    });

    if (!admin?.isAdmin) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'Only group admins can remove participants',
      );
    }

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
      [...(updated.participants || []), targetParticipant].forEach((p: any) => {
        this.gateway.server
          .to(`user:${p.profileId}`)
          .emit('conversation_updated', updated);
      });
    }

    return updated;
  }
}
