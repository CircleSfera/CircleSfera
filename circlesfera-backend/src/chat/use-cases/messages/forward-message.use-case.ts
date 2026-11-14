import { CHAT_FORWARD_MAX, ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception.js';
import { CryptoService } from '../../../common/services/crypto.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { SendMessageUseCase } from './send-message.use-case.js';

export interface ForwardResult {
  sent: string[];
  failed: Array<{ conversationId: string; errorCode: string }>;
}

// Forwarding a message, as Instagram's: a copy of a member's text or of the
// post it shares goes to up to CHAT_FORWARD_MAX of the forwarder's own
// chats, each sent by the forwarder through the normal way of sending
// (blocks, requests, hidden words, moderation, limits, who may see a post).
// A deleted message is never forwarded, nor a notice, a file, a voice note
// or a story: files belong to whoever uploaded them.
@Injectable()
export class ForwardMessageUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
    @Inject(SendMessageUseCase) private sendMessage: SendMessageUseCase,
  ) {}

  async execute(
    profileId: string,
    messageId: string,
    conversationIds: string[],
  ): Promise<ForwardResult> {
    const targets = [...new Set(conversationIds)];
    if (targets.length === 0 || targets.length > CHAT_FORWARD_MAX) {
      throw AppException.BadRequest(
        ErrorCode.BAD_REQUEST,
        `Forward to between 1 and ${CHAT_FORWARD_MAX} chats`,
      );
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        content: true,
        kind: true,
        isDeleted: true,
        url: true,
        voiceUrl: true,
        storyId: true,
        postId: true,
        gif: true,
        createdAt: true,
      },
    });
    // Only a member who can read the message may forward it: in the chat,
    // not deleted for them, and sent after they cleared it.
    const reader = message
      ? await this.prisma.participant.findFirst({
          where: {
            conversationId: message.conversationId,
            profileId,
            deletedAt: null,
          },
          select: { clearedAt: true },
        })
      : null;
    if (
      !message ||
      !reader ||
      (reader.clearedAt && message.createdAt <= reader.clearedAt)
    ) {
      throw AppException.NotFound(
        ErrorCode.MESSAGE_NOT_FOUND,
        'Message not found',
      );
    }
    if (
      message.kind !== 'USER' ||
      message.isDeleted ||
      message.url ||
      message.voiceUrl ||
      message.storyId ||
      (!message.content && !message.postId && !message.gif)
    ) {
      throw AppException.BadRequest(
        ErrorCode.MESSAGE_NOT_FORWARDABLE,
        'This message cannot be forwarded',
      );
    }

    const content = message.content
      ? this.cryptoService.decrypt(message.content)
      : '';
    const result: ForwardResult = { sent: [], failed: [] };
    for (const conversationId of targets) {
      try {
        await this.sendMessage.execute(
          profileId,
          undefined,
          content,
          undefined,
          undefined,
          conversationId,
          undefined,
          message.postId ?? undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          { forwarded: true, gifId: gifIdOf(message.gif) },
        );
        result.sent.push(conversationId);
      } catch (error: unknown) {
        result.failed.push({
          conversationId,
          errorCode:
            (error as { errorCode?: string })?.errorCode ??
            ErrorCode.INTERNAL_SERVER_ERROR,
        });
      }
    }
    return result;
  }
}

// The GIPHY id a stored GIF was sent by: the copy asks GIPHY for it again,
// so a GIF no longer shown at the app's rating is not forwarded.
function gifIdOf(gif: Prisma.JsonValue | null): string | undefined {
  return gif &&
    typeof gif === 'object' &&
    !Array.isArray(gif) &&
    typeof gif.id === 'string'
    ? gif.id
    : undefined;
}
