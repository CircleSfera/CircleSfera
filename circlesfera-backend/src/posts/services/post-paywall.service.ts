import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface PaywallMediaItem {
  id?: string;
  url?: string | null;
  standardUrl?: string | null;
  [key: string]: unknown;
}

export interface PaywallPost {
  id: string;
  profileId: string;
  isPremium?: boolean | null;
  media?: PaywallMediaItem[] | null;
  isLocked?: boolean;
  [key: string]: unknown;
}

@Injectable()
export class PostPaywallService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Applies the paywall to a list of posts, blurring media and setting isLocked if
   * the requesting user has neither authored the post nor unlocked it.
   */
  async applyPaywall<T extends PaywallPost>(
    posts: T[],
    currentProfileId?: string,
  ): Promise<Array<T & { isLocked?: boolean }>> {
    if (!posts || posts.length === 0) {
      return posts;
    }

    // Guest viewers: lock all premium posts and blur media
    if (!currentProfileId) {
      return posts.map((post) => {
        if (post.isPremium) {
          return {
            ...post,
            isLocked: true,
            media: post.media?.map((m) => this.buildTeaserMedia(m)),
          } as T;
        }
        return post;
      });
    }

    // Fetch user's unlocked posts (PostUnlock is keyed by User, not Profile)
    let unlockedPostIds = new Set<string>();
    const viewer = await this.prisma.profile.findUnique({
      where: { id: currentProfileId },
      select: { userId: true },
    });

    if (viewer) {
      const unlocks = await this.prisma.postUnlock.findMany({
        where: { userId: viewer.userId },
        select: { postId: true },
      });
      unlockedPostIds = new Set(unlocks.map((u) => u.postId));
    }

    return posts.map((post) => {
      // Author always has access to their own premium posts
      if (post.isPremium && post.profileId !== currentProfileId) {
        const isUnlocked = unlockedPostIds.has(post.id);

        if (!isUnlocked) {
          return {
            ...post,
            isLocked: true,
            media: post.media?.map((m) => this.buildTeaserMedia(m)),
          } as T;
        }
      }
      return post;
    });
  }

  private buildTeaserMedia(m: PaywallMediaItem): PaywallMediaItem {
    return {
      ...m,
      url: m.url ? `/media/teaser/${m.id ?? ''}/${m.url.split('/').pop()}` : '',
      standardUrl: m.standardUrl
        ? `/media/teaser/${m.id ?? ''}/master.m3u8`
        : '',
    };
  }
}
