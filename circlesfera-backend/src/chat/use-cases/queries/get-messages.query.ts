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
    userId?: string,
  ): Promise<Message[]> {
    let isParticipant = null;
    if (userId) {
      isParticipant = await this.prisma.participant.findFirst({
        where: {
          conversationId,
          userId,
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

    const messages = await this.prisma.message.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            profile: {
              select: { username: true, avatar: true },
            },
          },
        },
        post: {
          include: {
            media: true,
            user: {
              include: { profile: true },
            },
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                profile: { select: { username: true } },
              },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                profile: { select: { username: true } },
              },
            },
          },
        },
        messageUnlocks: userId ? { where: { userId } } : false,
      },
    });

    return (messages as any[]).map((m: any) => {
      if (m.content) {
        m.content = this.cryptoService.decrypt(m.content);
      }

      if (m.isLocked && userId && m.senderId !== userId) {
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
