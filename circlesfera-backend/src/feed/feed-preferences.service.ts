import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class FeedPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async hidePost(profileId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, profileId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
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
    const author = await this.prisma.user.findUnique({
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
        where: { profileId },
        select: { postId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.feedHiddenAuthor.findMany({
        where: { profileId },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
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
      hiddenPosts,
      hiddenAuthors: hiddenAuthors.map((h) => ({
        authorId: h.authorId,
        username: h.author.username,
        avatar: h.author.avatar,
        createdAt: h.createdAt,
      })),
      mutedKeywords: mutedKeywords.map((k) => ({
        keyword: k.keyword,
        createdAt: k.createdAt,
      })),
    };
  }

  /** IDs / keywords used by feed SQL filters. */
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
