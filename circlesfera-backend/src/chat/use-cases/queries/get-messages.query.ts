import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Message } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception.js';
import { CryptoService } from '../../../common/services/crypto.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class GetMessagesQuery {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
  ) {}

  async execute(
    conversationId: string,
    limit = 50,
    profileId?: string,
  ): Promise<Message[]> {
    let isParticipant = null;
    if (profileId) {
      isParticipant = await this.prisma.participant.findFirst({
        where: {
          conversationId,
          profileId,
        },
      });

      if (!isParticipant) {
        throw AppException.Forbidden(
          ErrorCode.FORBIDDEN_ACCESS,
          'You are not a participant in this conversation',
        );
      }
    }

    const whereClause: any = { conversationId };
    if (isParticipant?.clearedAt) {
      whereClause.createdAt = { gt: isParticipant.clearedAt };
    }

    let viewerUserId: string | undefined;
    if (profileId) {
      const viewer = await this.prisma.profile.findUnique({
        where: { id: profileId },
        select: { userId: true },
      });
      viewerUserId = viewer?.userId;
    }

    const messages = await this.prisma.message.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
            user: { select: { id: true } },
          },
        },
        post: {
          include: {
            media: true,
            profile: { include: { user: true } },
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                user: { select: { id: true } },
              },
            },
          },
        },
        reactions: {
          include: {
            profile: {
              select: {
                username: true,
                user: { select: { id: true } },
              },
            },
          },
        },
        messageUnlocks: viewerUserId
          ? { where: { userId: viewerUserId } }
          : false,
      },
    });

    return (messages as any[]).map((m: any) => {
      if (m.content) {
        m.content = this.cryptoService.decrypt(m.content);
      }

      if (m.isLocked && profileId && m.senderId !== profileId) {
        const isUnlocked = m.messageUnlocks && m.messageUnlocks.length > 0;
        if (!isUnlocked) {
          m.content = 'This message is locked. Pay to unlock.';
          m.url = null;
          m.standardUrl = null;
          m.thumbnailUrl = null;
          m.mediaType = null;
          m.voiceUrl = null;
        }
      }
      return m;
    }) as any;
  }
}
