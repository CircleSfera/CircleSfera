import { type ChatMessageSentEvent, ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Message, Prisma } from '@prisma/client';
import { DEFAULT_LOCALE } from '../../../common/constants/locale.constants.js';
import {
  canMonetize,
  MAX_PPV_PRICE_CENTS,
  MIN_PPV_PRICE_CENTS,
} from '../../../common/constants/monetization.constants.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { assertCanAccessPost } from '../../../common/policies/post-access.policy.js';
import { assertCanAccessStory } from '../../../common/policies/story-access.policy.js';
import { PUBLIC_PROFILE_SELECT } from '../../../common/selects/public-profile.select.js';
import { CryptoService } from '../../../common/services/crypto.service.js';
import {
  buildMediaCreateInput,
  buildVoiceMediaCreateInput,
  resolveMediaFields,
} from '../../../common/utils/media-lifecycle.util.js';
import { HiddenWordsService } from '../../../hidden-words/hidden-words.service.js';
import { renderChatPush } from '../../../notifications/notice-copy.js';
import {
  type PaywallPost,
  PostPaywallService,
} from '../../../posts/services/post-paywall.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PushService } from '../../../push/push.service.js';
import { ActionLimitsService } from '../../../trust/action-limits.service.js';
import { StoredFilesService } from '../../../uploads/services/stored-files.service.js';
import { isNotice } from '../../message-kind.js';

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
    @Inject(StoredFilesService)
    private readonly storedFiles: StoredFilesService,
    @Inject(PostPaywallService)
    private readonly postPaywall: PostPaywallService,
    @Inject(HiddenWordsService)
    private readonly hiddenWords: HiddenWordsService,
  ) {}

  private async assertShareable(
    tx: Prisma.TransactionClient,
    senderId: string,
    otherIds: string[],
    shared: { postId?: string; storyId?: string },
  ) {
    const canSee = (viewerId: string) =>
      shared.postId
        ? assertCanAccessPost(tx, shared.postId, viewerId)
        : assertCanAccessStory(
            tx as unknown as Parameters<typeof assertCanAccessStory>[0],
            shared.storyId as string,
            viewerId,
          );
    await canSee(senderId);
    for (const id of otherIds) {
      try {
        await canSee(id);
      } catch {
        throw AppException.Forbidden(
          ErrorCode.FORBIDDEN_ACCESS,
          'Someone in this conversation cannot see what you are sharing',
        );
      }
    }
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
    isLocked?: boolean,
    priceCents?: number,
  ): Promise<Message> {
    // Only the sending Profile's own stored files can be attached.
    await this.storedFiles.assertOwnedBy(senderId, [url, voiceUrl]);

    if (isLocked) {
      const senderProfile = await this.prisma.profile.findUnique({
        where: { id: senderId },
        select: { accountType: true },
      });
      if (!canMonetize(senderProfile?.accountType)) {
        throw AppException.Forbidden(
          ErrorCode.ACCOUNT_TYPE_NOT_ELIGIBLE_FOR_MONETIZATION,
          'Only Creator or Business accounts can send paid messages.',
        );
      }
      if (
        !priceCents ||
        priceCents < MIN_PPV_PRICE_CENTS ||
        priceCents > MAX_PPV_PRICE_CENTS
      ) {
        throw AppException.BadRequest(
          ErrorCode.PREMIUM_PRICE_OUT_OF_RANGE,
          'The price of a paid message is out of range.',
          { minCents: MIN_PPV_PRICE_CENTS, maxCents: MAX_PPV_PRICE_CENTS },
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

          // In a group, a declined invitation is no longer membership: only
          // a row still in the group may write. A 1:1 chat removed by the
          // sender comes back when they write in it.
          const isParticipant = conv.participants.some(
            (p: any) =>
              p.profileId === senderId &&
              (!conv.isGroup || p.deletedAt === null),
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

        // A shared post or story follows the rules of seeing it: the sender
        // and every other participant must be able to see it (no block, no
        // moderation removal, the privacy and audience of the author). The
        // sender learns only that it is not found; that someone in the
        // conversation cannot see it is said without naming who.
        if (postId || storyId) {
          await this.assertShareable(tx, senderId, participantIds, {
            postId,
            storyId,
          });
        }

        // A notice from the app cannot be replied to. A reply to a message
        // that no longer exists is sent as a plain message.
        let replyTarget = replyToId;
        if (replyToId) {
          const repliedTo = await tx.message.findUnique({
            where: { id: replyToId },
            select: { kind: true },
          });
          if (!repliedTo) {
            replyTarget = undefined;
          } else if (isNotice(repliedTo)) {
            throw AppException.BadRequest(
              ErrorCode.MESSAGE_IS_NOTICE,
              'A notice cannot be replied to',
            );
          }
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
            replyToId: replyTarget,
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
              },
            },
            media: true,
            voiceMedia: true,
            post: {
              include: {
                media: true,
                profile: { select: PUBLIC_PROFILE_SELECT },
              },
            },
            story: {
              include: {
                profile: { select: PUBLIC_PROFILE_SELECT },
              },
            },
            replyTo: {
              include: {
                sender: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
            },
            reactions: {
              include: {
                profile: {
                  select: {
                    username: true,
                  },
                },
              },
            },
          },
        });

        // A message request with one of the recipient's hidden words goes to
        // their Hidden requests, and stays there until they accept it. The
        // text is only compared, never kept or logged.
        if (!conv.isGroup && content) {
          for (const p of conv.participants as Array<{
            id: string;
            profileId: string;
            hasAccepted: boolean;
            requestHiddenByWords?: boolean;
          }>) {
            if (
              p.profileId === senderId ||
              p.hasAccepted ||
              p.requestHiddenByWords
            ) {
              continue;
            }
            if (await this.hiddenWords.hides(p.profileId, content)) {
              await tx.participant.update({
                where: { id: p.id },
                data: { requestHiddenByWords: true },
              });
            }
          }
        }
        // A new message brings a removed 1:1 chat back for both sides. A
        // group never: whoever declined it stays out.
        if (!conv.isGroup) {
          await tx.participant.updateMany({
            where: {
              conversationId: conv.id,
              deletedAt: { not: null },
            },
            data: {
              deletedAt: null,
            },
          });
        }

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

      // Each recipient reads the push in the language of their account.
      // A member who muted the chat gets no push for it until it ends.
      const muted = new Set(
        (
          await this.prisma.participant.findMany({
            where: {
              conversationId: conversation.id,
              mutedUntil: { gt: new Date() },
            },
            select: { profileId: true },
          })
        ).map((p) => p.profileId),
      );
      const recipients = conversation.participants.filter(
        (p: any) =>
          p.profileId !== senderId &&
          p.hasAccepted !== false &&
          !muted.has(p.profileId),
      );
      const locales = new Map(
        (recipients.length
          ? await this.prisma.profile.findMany({
              where: { id: { in: recipients.map((p: any) => p.profileId) } },
              select: { id: true, user: { select: { locale: true } } },
            })
          : []
        ).map((p) => [p.id, p.user?.locale ?? DEFAULT_LOCALE]),
      );
      recipients.forEach((p: any) => {
        this.pushService
          .sendNotification(
            p.profileId,
            {
              ...renderChatPush(
                locales.get(p.profileId) ?? DEFAULT_LOCALE,
                message.sender.username,
              ),
              data: { url: `/chat/${conversation.id}`, type: 'chat' },
            },
            'messages',
          )
          .catch((err) =>
            this.logger.error(
              'Failed sending push notification for chat message',
              err,
            ),
          );
      });
    } catch (err) {
      this.logger.error(
        'Failed to fan out chat message (sockets or pushes) after persist',
        err,
      );
    }

    // The sender gets the message back as they see it: a paid post they
    // share without having unlocked it stays closed to them. Each member
    // gets it the same way over the socket.
    if (payload.post?.isPremium) {
      const [post] = await this.postPaywall.applyPaywall(
        [payload.post as PaywallPost],
        senderId,
      );
      return { ...payload, post } as typeof payload;
    }
    return payload;
  }
}
