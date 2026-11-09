import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception.js';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '../../../common/pagination/keyset.util.js';
import { isUnlisted } from '../../../common/policies/removed-content.policy.js';
import { CryptoService } from '../../../common/services/crypto.service.js';
import {
  type PaywallPost,
  PostPaywallService,
} from '../../../posts/services/post-paywall.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  blockedWithViewer,
  unavailableProfile,
} from '../../blocked-participants.js';

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

// The three lists of a Profile's conversations: the inbox, message requests,
// and the requests with one of its hidden words.
export type ChatFolder = 'inbox' | 'requests' | 'hidden_requests';
export const CHAT_FOLDERS: ChatFolder[] = [
  'inbox',
  'requests',
  'hidden_requests',
];

function folderWhere(folder: ChatFolder) {
  if (folder === 'inbox') return { hasAccepted: true };
  return {
    hasAccepted: false,
    requestHiddenByWords: folder === 'hidden_requests',
  };
}

// Pinned chats first, newest pin first; the rest keep their order.
export function pinnedFirst<T extends { pinnedAt: Date | null }>(
  conversations: T[],
): T[] {
  const pinned = conversations
    .filter((c) => c.pinnedAt)
    .sort(
      (a, b) => (b.pinnedAt as Date).getTime() - (a.pinnedAt as Date).getTime(),
    );
  return [...pinned, ...conversations.filter((c) => !c.pinnedAt)];
}

@Injectable()
export class GetConversationsQuery {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
    @Inject(PostPaywallService) private postPaywall: PostPaywallService,
  ) {}

  async execute(profileId: string, folder: ChatFolder = 'inbox') {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            profileId,
            deletedAt: null,
            ...folderWhere(folder),
          },
        },
      },
      take: MAX_CONVERSATIONS,
      include: CONVERSATION_INCLUDE,
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const shown = await this.withUnavailable(profileId, conversations);
    const readable = await this.withSharedPostsAsSeenBy(
      profileId,
      shown.map((conv) => this.withReadablePreview(conv)),
    );
    return pinnedFirst(await this.withOwnSettings(profileId, readable));
  }

  // One page of the list, most recently active first. The cursor names the
  // last conversation of the page before (its updatedAt and id), so the
  // next page starts strictly after it however long the list is; a
  // malformed cursor starts from the top. nextCursor is null on the last
  // page.
  async executePage(
    profileId: string,
    folder: ChatFolder,
    cursor?: string,
    limit: number = CONVERSATION_PAGE_DEFAULT,
  ) {
    const take = Math.min(Math.max(limit, 1), CONVERSATION_PAGE_MAX);
    const after = cursor ? decodeKeysetCursor(cursor) : null;
    // Pinned chats come on the first page, before the rest, newest pin
    // first; the pages that follow never repeat them.
    const pinned =
      folder === 'inbox' && !cursor
        ? await this.prisma.conversation.findMany({
            where: {
              participants: {
                some: {
                  profileId,
                  deletedAt: null,
                  hasAccepted: true,
                  pinnedAt: { not: null },
                },
              },
            },
            include: CONVERSATION_INCLUDE,
          })
        : [];
    const rows = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            profileId,
            deletedAt: null,
            ...folderWhere(folder),
            ...(folder === 'inbox' && { pinnedAt: null }),
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
    const shown = await this.withUnavailable(profileId, [...pinned, ...items]);
    const readable = await this.withSharedPostsAsSeenBy(
      profileId,
      shown.map((conv) => this.withReadablePreview(conv)),
    );
    return {
      items: pinnedFirst(await this.withOwnSettings(profileId, readable)),
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

    const [shown] = await this.withUnavailable(profileId, [conv]);
    const [readable] = await this.withSharedPostsAsSeenBy(profileId, [
      this.withReadablePreview(shown),
    ]);
    const [own] = await this.withOwnSettings(profileId, [readable]);
    return own;
  }

  // What the viewer chose for each chat, read from their own row only: when
  // it is muted until, and when they pinned it. Nobody else's is shown.
  private async withOwnSettings<T extends { id: string }>(
    profileId: string,
    conversations: T[],
  ): Promise<Array<T & { mutedUntil: Date | null; pinnedAt: Date | null }>> {
    if (conversations.length === 0) return [];
    const rows = await this.prisma.participant.findMany({
      where: {
        profileId,
        conversationId: { in: conversations.map((c) => c.id) },
      },
      select: { conversationId: true, mutedUntil: true, pinnedAt: true },
    });
    const byConversation = new Map(rows.map((r) => [r.conversationId, r]));
    const now = new Date();
    return conversations.map((conv) => {
      const own = byConversation.get(conv.id);
      const mutedUntil =
        own?.mutedUntil && own.mutedUntil > now ? own.mutedUntil : null;
      return { ...conv, mutedUntil, pinnedAt: own?.pinnedAt ?? null };
    });
  }

  // A paid post the latest message shares shows closed to a viewer who has
  // not unlocked it, as it does everywhere else.
  private async withSharedPostsAsSeenBy<
    T extends { messages: { post?: unknown }[] },
  >(viewerProfileId: string, conversations: T[]): Promise<T[]> {
    const sharing = conversations
      .map((conv) => conv.messages?.[0])
      .filter((m): m is { post: PaywallPost } => Boolean(m?.post));
    if (sharing.length === 0) return conversations;
    const posts = await this.postPaywall.applyPaywall(
      sharing.map((m) => m.post),
      viewerProfileId,
    );
    sharing.forEach((m, i) => {
      m.post = posts[i];
    });
    return conversations;
  }

  // A participant in a block with the viewer, either way, stays in the
  // conversation but shows as unavailable: no name, handle or picture. In a
  // group only those members do.
  private async withUnavailable<
    T extends {
      participants: { profileId: string; profile: object | null }[];
    },
  >(viewerProfileId: string, conversations: T[]): Promise<T[]> {
    const blocked = await blockedWithViewer(
      this.prisma,
      viewerProfileId,
      conversations.flatMap((conv) =>
        (conv.participants ?? []).map((p) => p.profileId),
      ),
    );
    if (blocked.size === 0) return conversations;
    return conversations.map((conv) => ({
      ...conv,
      participants: (conv.participants ?? []).map((p) =>
        blocked.has(p.profileId) && p.profile
          ? { ...p, profile: unavailableProfile(p.profile) }
          : p,
      ),
    }));
  }

  // The latest message is stored encrypted; the list shows it in clear. A
  // deleted one shows no file, whatever its row may still name. A post it
  // shares that moderation removed is kept for its appeal and shown to
  // nobody, and one its author deleted is in their Recently deleted: the
  // message stays, without the post.
  private withReadablePreview<
    T extends {
      messages: {
        content: string | null;
        post?: { moderationStatus: string; deletedAt: Date | null } | null;
      }[];
    },
  >(conv: T): T {
    const lastMsg = conv.messages?.[0] as
      | (T['messages'][number] & {
          isDeleted?: boolean;
          url?: string | null;
          standardUrl?: string | null;
          thumbnailUrl?: string | null;
          mediaType?: string | null;
          voiceUrl?: string | null;
        })
      | undefined;
    if (lastMsg?.content) {
      lastMsg.content = this.cryptoService.decrypt(lastMsg.content);
    }
    if (lastMsg?.isDeleted) {
      lastMsg.url = null;
      lastMsg.standardUrl = null;
      lastMsg.thumbnailUrl = null;
      lastMsg.mediaType = null;
      lastMsg.voiceUrl = null;
    }
    if (lastMsg?.post && isUnlisted(lastMsg.post)) {
      (lastMsg as { post: unknown }).post = null;
    }
    return conv;
  }
}
