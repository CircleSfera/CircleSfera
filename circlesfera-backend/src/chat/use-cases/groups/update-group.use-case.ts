import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AppGateway } from '../../../socket/app.gateway.js';

@Injectable()
export class UpdateGroupUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ModuleRef) private moduleRef: ModuleRef,
  ) {}

  private get gateway(): AppGateway {
    return this.moduleRef.get(AppGateway, { strict: false });
  }

  async execute(
    userId: string,
    conversationId: string,
    name?: string,
    avatarUrl?: string,
  ) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, userId },
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
            user: {
              select: { id: true, profile: true },
            },
          },
        },
      },
    });

    updated?.participants?.forEach((p: any) => {
      this.gateway.server
        .to(`user:${p.userId}`)
        .emit('conversation_updated', updated);
    });

    return updated;
  }
}
