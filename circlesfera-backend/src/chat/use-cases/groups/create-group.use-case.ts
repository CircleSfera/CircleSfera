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

  async execute(profileId: string, participantIds: string[], name?: string) {
    const uniqueParticipantIds = Array.from(
      new Set(participantIds.filter((id) => id !== profileId)),
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
          { blockerId: profileId, blockedId: { in: uniqueParticipantIds } },
          { blockedId: profileId, blockerId: { in: uniqueParticipantIds } },
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
            { participants: { some: { profileId } } },
            { participants: { some: { profileId: recipientId } } },
          ],
        },
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

      if (existing) return existing;

      return this.prisma.conversation.create({
        data: {
          isGroup: false,
          participants: {
            create: [{ profileId }, { profileId: recipientId }],
          },
        },
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
    }

    const allParticipantIds = Array.from(
      new Set([profileId, ...uniqueParticipantIds]),
    );

    const conversation = await this.prisma.conversation.create({
      data: {
        isGroup: true,
        name,
        participants: {
          create: allParticipantIds.map((id) => ({
            profileId: id,
            isAdmin: id === profileId,
          })),
        },
      },
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

    conversation.participants.forEach((p) => {
      this.gateway.addConversationToSocket(p.profileId, conversation.id);
    });

    return conversation;
  }
}
