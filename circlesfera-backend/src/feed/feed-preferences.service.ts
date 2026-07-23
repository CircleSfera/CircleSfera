import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class FeedPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async hidePost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId === userId) {
      throw new BadRequestException('Cannot hide your own post');
    }

    await this.prisma.feedHiddenPost.upsert({
      where: { userId_postId: { userId, postId } },
      update: {},
      create: { userId, postId },
    });
    return { success: true };
  }

  async unhidePost(userId: string, postId: string) {
    await this.prisma.feedHiddenPost.deleteMany({
      where: { userId, postId },
    });
    return { success: true };
  }

  async hideAuthor(userId: string, authorId: string) {
    if (userId === authorId) {
      throw new BadRequestException('Cannot hide yourself');
    }
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true },
    });
    if (!author) throw new NotFoundException('Author not found');

    await this.prisma.feedHiddenAuthor.upsert({
      where: { userId_authorId: { userId, authorId } },
      update: {},
      create: { userId, authorId },
    });
    return { success: true };
  }

  async unhideAuthor(userId: string, authorId: string) {
    await this.prisma.feedHiddenAuthor.deleteMany({
      where: { userId, authorId },
    });
    return { success: true };
  }

  async muteKeyword(userId: string, keyword: string) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized.length < 2 || normalized.length > 64) {
      throw new BadRequestException('Keyword must be 2–64 characters');
    }

    await this.prisma.feedMutedKeyword.upsert({
      where: { userId_keyword: { userId, keyword: normalized } },
      update: {},
      create: { userId, keyword: normalized },
    });
    return { success: true, keyword: normalized };
  }

  async unmuteKeyword(userId: string, keyword: string) {
    const normalized = keyword.trim().toLowerCase();
    await this.prisma.feedMutedKeyword.deleteMany({
      where: { userId, keyword: normalized },
    });
    return { success: true };
  }

  async listPreferences(userId: string) {
    const [hiddenPosts, hiddenAuthors, mutedKeywords] = await Promise.all([
      this.prisma.feedHiddenPost.findMany({
        where: { userId },
        select: { postId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.feedHiddenAuthor.findMany({
        where: { userId },
        include: {
          author: {
            select: {
              id: true,
              profile: { select: { username: true, avatar: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.feedMutedKeyword.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return {
      hiddenPosts,
      hiddenAuthors: hiddenAuthors.map((h) => ({
        authorId: h.authorId,
        username: h.author.profile?.username,
        avatar: h.author.profile?.avatar,
        createdAt: h.createdAt,
      })),
      mutedKeywords: mutedKeywords.map((k) => ({
        keyword: k.keyword,
        createdAt: k.createdAt,
      })),
    };
  }

  /** IDs / keywords used by feed SQL filters. */
  async getFilterSets(userId: string) {
    const [hiddenPosts, hiddenAuthors, mutedKeywords] = await Promise.all([
      this.prisma.feedHiddenPost.findMany({
        where: { userId },
        select: { postId: true },
      }),
      this.prisma.feedHiddenAuthor.findMany({
        where: { userId },
        select: { authorId: true },
      }),
      this.prisma.feedMutedKeyword.findMany({
        where: { userId },
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
