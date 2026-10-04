import { type ChatMessageSentEvent, ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Message } from '@prisma/client';
import {
  canMonetize,
  MAX_PPV_PRICE_CENTS,
  MIN_PPV_PRICE_CENTS,
} from '../../../common/constants/monetization.constants.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { PUBLIC_USER_SELECT } from '../../../common/selects/public-user.select.js';
import { CryptoService } from '../../../common/services/crypto.service.js';
import {
  buildMediaCreateInput,
  buildVoiceMediaCreateInput,
  resolveMediaFields,
} from '../../../common/utils/media-lifecycle.util.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PushService } from '../../../push/push.service.js';
import { ActionLimitsService } from '../../../trust/action-limits.service.js';

@Injectable()
export class SendMessageUseCase {
  private readonly logger = new Logger(SendMessageUseCase.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
    @Inject(PushService) private pushService: PushService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
    @Inject(ActionLimitsService)
    private readonly actionLimits: ActionLimitsService,
  ) {}

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
    isLocked?: boolean,
    priceCents?: number,
  ): Promise<Message> {
    if (isLocked) {
      const senderProfile = await this.prisma.profile.findUnique({
        where: { id: senderId },
        select: { accountType: true },
      });
      if (!canMonetize(senderProfile?.accountType)) {
        throw AppException.Forbidden(
          ErrorCode.ACCOUNT_TYPE_NOT_ELIGIBLE_FOR_MONETIZATION,
          'Solo las cuentas Creator o Business pueden enviar mensajes de pago.',
        );
      }
      if (
        !priceCents ||
        priceCents < MIN_PPV_PRICE_CENTS ||
        priceCents > MAX_PPV_PRICE_CENTS
      ) {
        throw AppException.BadRequest(
          ErrorCode.BAD_REQUEST,
          `El precio del mensaje debe estar entre €${(MIN_PPV_PRICE_CENTS / 100).toFixed(2)} y €${(MAX_PPV_PRICE_CENTS / 100).toFixed(2)}.`,
        );
      }
    }

    const encryptedContent = this.cryptoService.encrypt(content);

    const { message, conversation } = await this.prisma.$transaction(
      async (tx) => {
        let conv: any;
        let isNewRequest = false;

        if (conversationId) {
          conv = await tx.conversation.findUnique({
            where: { id: conversationId },
            include: {
              participants: {
                include: {
                  profile: { select: { id: true } },
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
            (p: any) => p.profileId === senderId,
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
                { participants: { some: { profileId: senderId } } },
                { participants: { some: { profileId: recipientId } } },
              ],
            },
            include: {
              participants: {
                include: {
                  profile: { select: { id: true } },
                },
              },
            },
          });

          if (!conv) {
            const recipientFollowsSender = await tx.follow.findFirst({
              where: {
                followerId: recipientId,
                followingId: senderId,
                status: 'ACCEPTED',
              },
            });
            isNewRequest = !recipientFollowsSender;

            conv = await tx.conversation.create({
              data: {
                isGroup: false,
                participants: {
                  create: [
                    { profileId: senderId, hasAccepted: true },
                    {
                      profileId: recipientId,
                      hasAccepted: Boolean(recipientFollowsSender),
                    },
                  ],
                },
              },
              include: {
                participants: {
                  include: {
                    profile: { select: { id: true } },
                  },
                },
              },
            });
          }
        } else {
          throw AppException.BadRequest(
            ErrorCode.BAD_REQUEST,
            'Either conversationId or recipientId is required',
          );
        }

        const participantIds = conv.participants
          .map((p: any) => p.profileId)
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

        // A first message to someone who does not follow the sender is a
        // message request, which has its own per-Profile cap. Checked after
        // the block check so a refused attempt is not counted; a refusal
        // rolls back the new conversation.
        if (isNewRequest) {
          await this.actionLimits.consume(senderId, 'message_request');
        }

        // Media rows are created separately (not via a nested `media: {
        // create }`) because mixing raw FK scalars (senderId, conversationId,
        // postId, ...) with a nested relation create isn't a valid Prisma
        // input shape.
        const media = url
          ? await tx.media.create({
              data: buildMediaCreateInput({ type: mediaType || 'image', url }),
            })
          : null;
        const voiceMedia = voiceUrl
          ? await tx.media.create({
              data: buildVoiceMediaCreateInput(voiceUrl),
            })
          : null;

        const msg = await tx.message.create({
          data: {
            content: encryptedContent,
            senderId,
            conversationId: conv.id,
            url,
            mediaType,
            mediaId: media?.id,
            postId,
            storyId,
            replyToId,
            voiceUrl,
            voiceDuration,
            voiceMediaId: voiceMedia?.id,
            voiceWaveform: voiceWaveform
              ? JSON.parse(JSON.stringify(voiceWaveform))
              : undefined,
            ...(isLocked ? { isLocked: true, priceCents } : {}),
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                avatar: true,
                user: { select: { id: true } },
              },
            },
            media: true,
            voiceMedia: true,
            post: {
              include: {
                media: true,
                profile: { include: { user: { select: PUBLIC_USER_SELECT } } },
              },
            },
            story: {
              include: {
                profile: { include: { user: { select: PUBLIC_USER_SELECT } } },
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

    // Spam signals: count the write, and fingerprint text sent to someone
    // who has not accepted the conversation (a message request). Ordinary
    // chats are never fingerprinted.
    void this.actionLimits.trackWrite(senderId);
    const unsolicited = conversation.participants.some(
      (p: { profileId: string; hasAccepted: boolean }) =>
        p.profileId !== senderId && !p.hasAccepted,
    );
    if (unsolicited && content) {
      void this.actionLimits.recordText(senderId, content);
    }

    const { voiceMedia, ...messageWithoutVoiceMedia } = message;
    const resolvedMessage = {
      ...resolveMediaFields(messageWithoutVoiceMedia),
      voiceUrl: voiceMedia?.url ?? message.voiceUrl,
    };
    const payload = { ...resolvedMessage, content, tempId };

    try {
      const event: ChatMessageSentEvent['payload'] = {
        participants: conversation.participants,
        payload,
      };
      this.eventEmitter.emit('chat.message.sent', event);

      conversation.participants.forEach((p: any) => {
        if (p.profileId !== senderId && p.hasAccepted !== false) {
          this.pushService
            .sendNotification(p.profileId, {
              title: `Nuevo mensaje cifrado`,
              body: `Has recibido un mensaje de @${message.sender.username || 'Alguien'}`,
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
    } catch (err) {
      this.logger.error(
        'Failed to fan out chat message over sockets after persist',
        err,
      );
    }

    return payload;
  }
}
