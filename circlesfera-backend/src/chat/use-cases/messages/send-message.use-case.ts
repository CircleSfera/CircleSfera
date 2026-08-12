import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Message } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception.js';
import { CryptoService } from '../../../common/services/crypto.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PushService } from '../../../push/push.service.js';
import { AppGateway } from '../../../socket/app.gateway.js';

@Injectable()
export class SendMessageUseCase {
  private readonly logger = new Logger(SendMessageUseCase.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
    @Inject(PushService) private pushService: PushService,
    @Inject(ModuleRef) private moduleRef: ModuleRef,
  ) {}

  private get gateway(): AppGateway {
    return this.moduleRef.get(AppGateway, { strict: false });
  }

  async execute(
    senderId: string,
    recipientId: string | undefined,
    content: string,
    url?: string,
    mediaType?: string,
    conversationId?: string,
    tempId?: string,
    postId?: string,
    storyId?: string,
    replyToId?: string,
    voiceUrl?: string,
    voiceDuration?: number,
    voiceWaveform?: number[],
  ): Promise<Message> {
    const encryptedContent = this.cryptoService.encrypt(content);

    const { message, conversation } = await this.prisma.$transaction(
      async (tx) => {
        let conv: any;

        if (conversationId) {
          conv = await tx.conversation.findUnique({
            where: { id: conversationId },
            include: {
              participants: {
                include: {
                  user: { select: { id: true } },
                },
              },
            },
          });

          if (!conv)
            throw AppException.NotFound(
              ErrorCode.NOT_FOUND,
              'Conversation not found',
            );

          const isParticipant = conv.participants.some(
            (p: any) => p.userId === senderId,
          );
          if (!isParticipant)
            throw AppException.Forbidden(
              ErrorCode.FORBIDDEN_ACCESS,
              'Not a participant',
            );
        } else if (recipientId) {
          conv = await tx.conversation.findFirst({
            where: {
              isGroup: false,
              AND: [
                { participants: { some: { userId: senderId } } },
                { participants: { some: { userId: recipientId } } },
              ],
            },
            include: {
              participants: {
                include: {
                  user: { select: { id: true } },
                },
              },
            },
          });

          if (!conv) {
            conv = await tx.conversation.create({
              data: {
                isGroup: false,
                participants: {
                  create: [{ userId: senderId }, { userId: recipientId }],
                },
              },
              include: { participants: true },
            });
          }
        } else {
          throw AppException.BadRequest(
            ErrorCode.BAD_REQUEST,
            'Either conversationId or recipientId is required',
          );
        }

        const participantIds = conv.participants
          .map((p: any) => p.userId)
          .filter((id: string) => id !== senderId);

        const blocks = await tx.block.findMany({
          where: {
            OR: [
              { blockerId: senderId, blockedId: { in: participantIds } },
              { blockedId: senderId, blockerId: { in: participantIds } },
            ],
          },
        });

        if (blocks.length > 0) {
          throw AppException.Forbidden(
            ErrorCode.FORBIDDEN_ACCESS,
            'Cannot send message: Blocked by a participant or you blocked them',
          );
        }

        const msg = await tx.message.create({
          data: {
            content: encryptedContent,
            senderId,
            conversationId: conv.id,
            url,
            mediaType,
            postId,
            storyId,
            replyToId,
            voiceUrl,
            voiceDuration,
            voiceWaveform: voiceWaveform
              ? JSON.parse(JSON.stringify(voiceWaveform))
              : undefined,
          },
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
            story: {
              include: {
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
          },
        });

        await tx.participant.updateMany({
          where: {
            conversationId: conv.id,
            deletedAt: { not: null },
          },
          data: {
            deletedAt: null,
          },
        });

        return { message: msg, conversation: conv };
      },
    );

    conversation.participants.forEach((p: any) => {
      this.gateway.addConversationToSocket(p.userId, conversation.id);

      this.gateway.server
        .to(`user:${p.userId}`)
        .emit('receiveMessage', { ...message, content, tempId });

      if (p.userId !== senderId) {
        this.pushService
          .sendNotification(p.userId, {
            title: `Nuevo mensaje cifrado`,
            body: `Has recibido un mensaje de @${message.sender.profile?.username || 'Alguien'}`,
            data: { url: `/chat/${conversation.id}`, type: 'chat' },
          })
          .catch((err) =>
            this.logger.error(
              'Failed sending push notification for chat message',
              err,
            ),
          );
      }
    });

    return message;
  }
}
