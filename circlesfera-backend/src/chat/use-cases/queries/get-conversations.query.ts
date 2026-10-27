import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception.js';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '../../../common/pagination/keyset.util.js';
import { CryptoService } from '../../../common/services/crypto.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

// Hard cap on the conversation list — this endpoint returns a plain array
// (not createPaginatedResult) to keep the existing API contract, so bounding
// is a fixed take rather than page/limit params. Ordered by
// updatedAt desc, so the most recently active conversations are the ones
// that would ever fall outside this cap. The app reads the list a page at a
// time instead (executePage), so every conversation can be reached.
const MAX_CONVERSATIONS = 100;

// A page of the list: enough to fill a phone screen a few times over.
export const CONVERSATION_PAGE_DEFAULT = 30;
export const CONVERSATION_PAGE_MAX = 50;

// What a conversation of the list carries: who is in it and its latest
// message, with the post it shares. A notice from the app (someone became
// admin) is never the latest message: the list shows what members wrote,
// and the unread count, read from that same message, never counts a notice.
const CONVERSATION_INCLUDE = {
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
  messages: {
    where: { kind: 'USER' },
    orderBy: {
      createdAt: 'desc',
    },
    take: 1,
    include: {
      post: {
        include: {
          media: true,
          profile: {
            select: {
              id: true,
              username: true,
              avatar: true,
              thumbnailUrl: true,
              standardUrl: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ConversationInclude;

@Injectable()
export class GetConversationsQuery {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
  ) {}

  async execute(profileId: string, folder: 'inbox' | 'requests' = 'inbox') {
    const hasAccepted = folder !== 'requests';
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            profileId,
            deletedAt: null,
            hasAccepted,
          },
        },
      },
      take: MAX_CONVERSATIONS,
      include: CONVERSATION_INCLUDE,
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return conversations.map((conv) => this.withReadablePreview(conv));
  }

  // One page of the list, most recently active first. The cursor names the
  // last conversation of the page before (its updatedAt and id), so the
  // next page starts strictly after it however long the list is; a
  // malformed cursor starts from the top. nextCursor is null on the last
  // page.
  async executePage(
    profileId: string,
    folder: 'inbox' | 'requests',
    cursor?: string,
    limit: number = CONVERSATION_PAGE_DEFAULT,
  ) {
    const take = Math.min(Math.max(limit, 1), CONVERSATION_PAGE_MAX);
    const after = cursor ? decodeKeysetCursor(cursor) : null;
    const rows = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            profileId,
            deletedAt: null,
            hasAccepted: folder !== 'requests',
          },
        },
        ...(after && {
          OR: [
            { updatedAt: { lt: after.createdAt } },
            { updatedAt: after.createdAt, id: { lt: after.id } },
          ],
        }),
      },
      take: take + 1,
      include: CONVERSATION_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    const items = rows.slice(0, take);
    const last = items.at(-1);
    return {
      items: items.map((conv) => this.withReadablePreview(conv)),
      nextCursor:
        rows.length > take && last
          ? encodeKeysetCursor({ createdAt: last.updatedAt, id: last.id })
          : null,
    };
  }

  async executeOne(conversationId: string, profileId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: {
            profileId,
            deletedAt: null,
          },
        },
      },
      include: CONVERSATION_INCLUDE,
    });

    if (!conv) {
      throw AppException.NotFound(
        ErrorCode.NOT_FOUND,
        'Conversation not found',
      );
    }

    return this.withReadablePreview(conv);
  }

  // The latest message is stored encrypted; the list shows it in clear.
  private withReadablePreview<
    T extends { messages: { content: string | null }[] },
  >(conv: T): T {
    const lastMsg = conv.messages?.[0];
    if (lastMsg?.content) {
      lastMsg.content = this.cryptoService.decrypt(lastMsg.content);
    }
    return conv;
  }
}
