import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AppGateway } from '../../../socket/app.gateway.js';

@Injectable()
export class DeleteConversationUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ModuleRef) private moduleRef: ModuleRef,
  ) {}

  private get gateway(): AppGateway {
    return this.moduleRef.get(AppGateway, { strict: false });
  }

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

      participant.conversation.participants.forEach((p) => {
        this.gateway.server
          .to(`user:${p.profileId}`)
          .emit('conversationDeleted', { conversationId });
      });

      return { success: true };
    }

    await this.prisma.participant.update({
      where: { id: participant.id },
      data: {
        deletedAt: new Date(),
        clearedAt: new Date(),
      },
    });

    this.gateway.server
      .to(`user:${profileId}`)
      .emit('conversationDeleted', { conversationId });

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
