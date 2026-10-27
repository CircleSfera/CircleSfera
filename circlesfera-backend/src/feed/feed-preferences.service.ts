import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  type KeysetCursor,
  keysetBeforeDesc,
} from '../common/pagination/keyset.util.js';
import { LISTED_POST } from '../common/policies/removed-content.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';

// The settings read each list a page at a time, so every entry can be
// reached, and undone, however long the list grows.
export const PREFERENCE_PAGE_DEFAULT = 30;
export const PREFERENCE_PAGE_MAX = 50;

const HIDDEN_POST_SELECT = {
  id: true,
  postId: true,
  createdAt: true,
  post: {
    select: {
      caption: true,
      media: {
        take: 1,
        orderBy: { order: 'asc' },
        select: {
          url: true,
          thumbnailUrl: true,
          standardUrl: true,
        },
      },
      profile: {
        select: {
          username: true,
          avatar: true,
        },
      },
    },
  },
} satisfies Prisma.FeedHiddenPostSelect;

const HIDDEN_AUTHOR_INCLUDE = {
  author: {
    select: {
      id: true,
      username: true,
      avatar: true,
    },
  },
} satisfies Prisma.FeedHiddenAuthorInclude;

const toHiddenPost = (
  h: Prisma.FeedHiddenPostGetPayload<{ select: typeof HIDDEN_POST_SELECT }>,
) => ({
  postId: h.postId,
  createdAt: h.createdAt,
  caption: h.post?.caption ?? null,
  thumbnailUrl:
    h.post?.media?.[0]?.thumbnailUrl ||
    h.post?.media?.[0]?.standardUrl ||
    h.post?.media?.[0]?.url ||
    null,
  authorUsername: h.post?.profile?.username ?? null,
  authorAvatar: h.post?.profile?.avatar ?? null,
});

const toHiddenAuthor = (
  h: Prisma.FeedHiddenAuthorGetPayload<{
    include: typeof HIDDEN_AUTHOR_INCLUDE;
  }>,
) => ({
  authorId: h.authorId,
  username: h.author.username,
  avatar: h.author.avatar,
  createdAt: h.createdAt,
});

const toMutedKeyword = (k: { keyword: string; createdAt: Date }) => ({
  keyword: k.keyword,
  createdAt: k.createdAt,
});

export type PreferenceList =
  | 'hidden-posts'
  | 'hidden-authors'
  | 'muted-keywords';

@Injectable()
export class FeedPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async hidePost(profileId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, profileId: true, deletedAt: true },
    });
    if (!post || post.deletedAt) throw new NotFoundException('Post not found');
    if (post.profileId === profileId) {
      throw new BadRequestException('Cannot hide your own post');
    }

    await this.prisma.feedHiddenPost.upsert({
      where: { profileId_postId: { profileId, postId } },
      update: {},
      create: { profileId, postId },
    });
    return { success: true };
  }

  async unhidePost(profileId: string, postId: string) {
    await this.prisma.feedHiddenPost.deleteMany({
      where: { profileId, postId },
    });
    return { success: true };
  }

  async hideAuthor(profileId: string, authorId: string) {
    if (profileId === authorId) {
      throw new BadRequestException('Cannot hide yourself');
    }
    // The author is a Profile: the one that wrote the post.
    const author = await this.prisma.profile.findUnique({
      where: { id: authorId },
      select: { id: true },
    });
    if (!author) throw new NotFoundException('Author not found');

    await this.prisma.feedHiddenAuthor.upsert({
      where: { profileId_authorId: { profileId, authorId } },
      update: {},
      create: { profileId, authorId },
    });
    return { success: true };
  }

  async unhideAuthor(profileId: string, authorId: string) {
    await this.prisma.feedHiddenAuthor.deleteMany({
      where: { profileId, authorId },
    });
    return { success: true };
  }

  async muteKeyword(profileId: string, keyword: string) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized.length < 2 || normalized.length > 64) {
      throw new BadRequestException('Keyword must be 2–64 characters');
    }

    await this.prisma.feedMutedKeyword.upsert({
      where: { profileId_keyword: { profileId, keyword: normalized } },
      update: {},
      create: { profileId, keyword: normalized },
    });
    return { success: true, keyword: normalized };
  }

  async unmuteKeyword(profileId: string, keyword: string) {
    const normalized = keyword.trim().toLowerCase();
    await this.prisma.feedMutedKeyword.deleteMany({
      where: { profileId, keyword: normalized },
    });
    return { success: true };
  }

  async listPreferences(profileId: string) {
    const [hiddenPosts, hiddenAuthors, mutedKeywords] = await Promise.all([
      this.prisma.feedHiddenPost.findMany({
        where: { profileId, post: LISTED_POST },
        select: HIDDEN_POST_SELECT,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.feedHiddenAuthor.findMany({
        where: { profileId },
        include: HIDDEN_AUTHOR_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.feedMutedKeyword.findMany({
        where: { profileId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return {
      hiddenPosts: hiddenPosts.map(toHiddenPost),
      hiddenAuthors: hiddenAuthors.map(toHiddenAuthor),
      mutedKeywords: mutedKeywords.map(toMutedKeyword),
    };
  }

  // One page of a list, most recent first. The cursor names the last entry
  // of the page before (when it was added and its id), so the next page
  // starts strictly after it; a malformed cursor starts from the top.
  // nextCursor is null on the last page.
  async listPage(
    profileId: string,
    list: PreferenceList,
    cursor?: string,
    limit: number = PREFERENCE_PAGE_DEFAULT,
  ) {
    const take = Math.min(Math.max(limit, 1), PREFERENCE_PAGE_MAX) + 1;
    const after = cursor ? decodeKeysetCursor(cursor) : null;
    const where = { profileId, ...(after && keysetBeforeDesc(after)) };
    const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }] as const;

    if (list === 'hidden-posts') {
      // A post moderation removed is kept for its appeal, shown nowhere.
      const rows = await this.prisma.feedHiddenPost.findMany({
        where: { ...where, post: LISTED_POST },
        select: HIDDEN_POST_SELECT,
        orderBy: [...orderBy],
        take,
      });
      return this.page(rows, take, toHiddenPost);
    }
    if (list === 'hidden-authors') {
      const rows = await this.prisma.feedHiddenAuthor.findMany({
        where,
        include: HIDDEN_AUTHOR_INCLUDE,
        orderBy: [...orderBy],
        take,
      });
      return this.page(rows, take, toHiddenAuthor);
    }
    const rows = await this.prisma.feedMutedKeyword.findMany({
      where,
      orderBy: [...orderBy],
      take,
    });
    return this.page(rows, take, toMutedKeyword);
  }

  // take is one more than the page, to know whether another page follows.
  private page<T extends KeysetCursor, R>(
    rows: T[],
    take: number,
    toItem: (row: T) => R,
  ) {
    const items = rows.slice(0, take - 1);
    const last = items.at(-1);
    return {
      items: items.map(toItem),
      nextCursor:
        rows.length === take && last
          ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  // IDs / keywords used by feed SQL filters.
  async getFilterSets(profileId: string) {
    const [hiddenPosts, hiddenAuthors, mutedKeywords] = await Promise.all([
      this.prisma.feedHiddenPost.findMany({
        where: { profileId },
        select: { postId: true },
      }),
      this.prisma.feedHiddenAuthor.findMany({
        where: { profileId },
        select: { authorId: true },
      }),
      this.prisma.feedMutedKeyword.findMany({
        where: { profileId },
        select: { keyword: true },
      }),
    ]);

    return {
      hiddenPostIds: hiddenPosts.map((p) => p.postId),
      hiddenAuthorIds: hiddenAuthors.map((a) => a.authorId),
      mutedKeywords: mutedKeywords.map((k) => k.keyword),
    };
  }
}
