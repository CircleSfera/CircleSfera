import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AppGateway } from '../../../socket/app.gateway.js';

@Injectable()
export class LeaveGroupUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ModuleRef) private moduleRef: ModuleRef,
  ) {}

  private get gateway(): AppGateway {
    return this.moduleRef.get(AppGateway, { strict: false });
  }

  async execute(userId: string, conversationId: string) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, userId },
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
            user: {
              select: { id: true, profile: true },
            },
          },
        },
      },
    });

    if (updated) {
      updated?.participants?.forEach((p: any) => {
        this.gateway.server
          .to(`user:${p.userId}`)
          .emit('conversation_updated', updated);
      });
    }

    this.gateway.server
      .to(`user:${userId}`)
      .emit('conversationDeleted', { conversationId });

    return { success: true };
  }
}
