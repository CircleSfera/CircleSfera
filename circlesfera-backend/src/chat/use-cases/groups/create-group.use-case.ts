import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AppGateway } from '../../../socket/app.gateway.js';

@Injectable()
export class CreateGroupUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ModuleRef) private moduleRef: ModuleRef,
  ) {}

  private get gateway(): AppGateway {
    return this.moduleRef.get(AppGateway, { strict: false });
  }

  async execute(userId: string, participantIds: string[], name?: string) {
    const uniqueParticipantIds = Array.from(
      new Set(participantIds.filter((id) => id !== userId)),
    );

    if (uniqueParticipantIds.length === 0) {
      throw AppException.BadRequest(
        ErrorCode.BAD_REQUEST,
        'Cannot create a conversation with yourself',
      );
    }

    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: uniqueParticipantIds } },
          { blockedId: userId, blockerId: { in: uniqueParticipantIds } },
        ],
      },
    });

    if (blocks.length > 0) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'Cannot create a conversation with blocked users',
      );
    }

    if (uniqueParticipantIds.length === 1 && !name) {
      const recipientId = uniqueParticipantIds[0];

      const existing = await this.prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: [
            { participants: { some: { userId } } },
            { participants: { some: { userId: recipientId } } },
          ],
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  profile: true,
                },
              },
            },
          },
        },
      });

      if (existing) return existing;

      return this.prisma.conversation.create({
        data: {
          isGroup: false,
          participants: {
            create: [{ userId }, { userId: recipientId }],
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  profile: true,
                },
              },
            },
          },
        },
      });
    }

    const allParticipantIds = Array.from(
      new Set([userId, ...uniqueParticipantIds]),
    );

    const conversation = await this.prisma.conversation.create({
      data: {
        isGroup: true,
        name,
        participants: {
          create: allParticipantIds.map((id) => ({
            userId: id,
            isAdmin: id === userId,
          })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                profile: true,
              },
            },
          },
        },
      },
    });

    conversation.participants.forEach((p) => {
      this.gateway.addConversationToSocket(p.userId, conversation.id);
    });

    return conversation;
  }
}
