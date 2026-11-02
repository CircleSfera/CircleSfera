import { ErrorCode } from '@circlesfera/shared';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Visibility } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { assertCanAccessPost } from '../common/policies/post-access.policy.js';
import {
  promotionReaches,
  viewerCountryOf,
} from '../common/promotions/promotion-country.js';
import { PrismaService } from '../prisma/prisma.service.js';

// How far back the viewer's own activity counts as a reason.
const ACTIVITY_DAYS = 90;
// A post this recent is "new".
const NEW_HOURS = 48;
// The For You feed calls a post popular above this performance score, and a
// match with the viewer's taste above this similarity (feed.service.ts).
export const POPULAR_SCORE = 20;
export const SIMILAR_SCORE = 0.65;
// The viewer's likes the taste is read from, as the feed does.
const RECENT_LIKES = 20;

export type WhyReason =
  | { code: 'own' }
  | { code: 'following'; username: string }
  | { code: 'close_friend'; username: string }
  | { code: 'engaged_with_author'; username: string }
  | { code: 'liked_similar_tags'; tags: string[] }
  | { code: 'similar_content' }
  | { code: 'popular' }
  | { code: 'new' }
  | { code: 'promoted'; username: string; countries: string[] };

/**
 * Why one post is shown to one viewer: only reasons that are true for this
 * viewer, read from what the viewer may know (their own follows, likes,
 * comments and saves, the author's public handle, a promotion's public
 * aim). Never who else liked it, nor anything of a private account. A post
 * the viewer cannot see answers not found, whatever the reason it is hidden.
 */
@Injectable()
export class PostWhyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async why(
    postId: string,
    viewerProfileId?: string | null,
  ): Promise<{ reasons: WhyReason[] }> {
    try {
      await assertCanAccessPost(this.prisma, postId, viewerProfileId);
    } catch (error: unknown) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw AppException.NotFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
      }
      throw error;
    }

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        profileId: true,
        visibility: true,
        createdAt: true,
        performanceScore: true,
        profile: { select: { username: true } },
        hashtags: {
          where: { hashtag: { isHidden: false } },
          select: { hashtag: { select: { id: true, tag: true } } },
        },
      },
    });
    if (!post) {
      throw AppException.NotFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
    }
    const author = post.profile?.username ?? '';
    const reasons: WhyReason[] = [];
    const viewer = viewerProfileId ?? null;

    if (viewer && viewer === post.profileId) {
      reasons.push({ code: 'own' });
    } else if (viewer) {
      reasons.push(...(await this.relationshipReasons(viewer, post, author)));
    }

    const promoted = await this.promotionReason(post.id, viewer, author);
    if (promoted) reasons.push(promoted);
    if ((post.performanceScore ?? 0) > POPULAR_SCORE) {
      reasons.push({ code: 'popular' });
    }
    if (Date.now() - post.createdAt.getTime() < NEW_HOURS * 3_600_000) {
      reasons.push({ code: 'new' });
    }
    return { reasons };
  }

  private async relationshipReasons(
    viewer: string,
    post: {
      id: string;
      profileId: string;
      visibility: Visibility;
      hashtags: { hashtag: { id: string; tag: string } }[];
    },
    author: string,
  ): Promise<WhyReason[]> {
    const reasons: WhyReason[] = [];
    const since = new Date(Date.now() - ACTIVITY_DAYS * 86_400_000);

    const [follow, closeFriend] = await Promise.all([
      this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewer,
            followingId: post.profileId,
          },
        },
        select: { status: true },
      }),
      // Said only for a post for close friends: the viewer sees it because
      // the author has them on that list, which they then already know.
      post.visibility === Visibility.PRIVATE
        ? this.prisma.closeFriend.findUnique({
            where: {
              profileId_friendId: {
                profileId: post.profileId,
                friendId: viewer,
              },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    const follows = follow?.status === 'ACCEPTED';
    if (closeFriend) reasons.push({ code: 'close_friend', username: author });
    if (follows) {
      reasons.push({ code: 'following', username: author });
    } else {
      const [liked, commented] = await Promise.all([
        this.prisma.like.count({
          where: {
            profileId: viewer,
            createdAt: { gte: since },
            post: { profileId: post.profileId, id: { not: post.id } },
          },
        }),
        this.prisma.comment.count({
          where: {
            profileId: viewer,
            createdAt: { gte: since },
            post: { profileId: post.profileId, id: { not: post.id } },
          },
        }),
      ]);
      if (liked + commented > 0) {
        reasons.push({ code: 'engaged_with_author', username: author });
      }
    }

    // Tags of this post that are also on posts the viewer liked or saved.
    const tagIds = post.hashtags.map((h) => h.hashtag.id);
    if (tagIds.length > 0) {
      const shared = await this.prisma.postHashtag.findMany({
        where: {
          hashtagId: { in: tagIds },
          postId: { not: post.id },
          post: {
            OR: [
              {
                likes: {
                  some: { profileId: viewer, createdAt: { gte: since } },
                },
              },
              {
                bookmarks: {
                  some: { profileId: viewer, createdAt: { gte: since } },
                },
              },
            ],
          },
        },
        distinct: ['hashtagId'],
        select: { hashtag: { select: { tag: true } } },
        take: 3,
      });
      if (shared.length > 0) {
        reasons.push({
          code: 'liked_similar_tags',
          tags: shared.map((s) => s.hashtag.tag),
        });
      }
    }

    if (await this.matchesTaste(viewer, post.id)) {
      reasons.push({ code: 'similar_content' });
    }
    return reasons;
  }

  // The same measure the For You feed ranks by: how close the post is to
  // what the viewer liked lately.
  private async matchesTaste(viewer: string, postId: string): Promise<boolean> {
    const likes = await this.prisma.like.findMany({
      where: { profileId: viewer, postId: { not: postId } },
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIKES,
      select: { postId: true },
    });
    if (likes.length === 0) return false;
    const rows = await this.prisma.$queryRaw<{ score: number | null }[]>(
      Prisma.sql`
        SELECT 1 - (pe.vector <=> (
          SELECT AVG(v.vector) FROM "post_embeddings" v
          WHERE v."postId" = ANY(${likes.map((l) => l.postId)}::text[])
        )) AS score
        FROM "post_embeddings" pe
        WHERE pe."postId" = ${postId}
      `,
    );
    const score = rows[0]?.score;
    return score != null && Number(score) > SIMILAR_SCORE;
  }

  // A promotion of this post that reaches this viewer: who paid and where
  // it is aimed, as the promoted post itself says.
  private async promotionReason(
    postId: string,
    viewer: string | null,
    author: string,
  ): Promise<WhyReason | null> {
    const promotion = await this.prisma.promotion.findFirst({
      where: {
        status: 'ACTIVE',
        targetType: 'POST',
        targetId: postId,
        budgetCents: { gt: 0 },
        endDate: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { countries: true },
    });
    if (!promotion) return null;
    let viewerCountry: string | null = null;
    if (viewer) {
      const profile = await this.prisma.profile.findUnique({
        where: { id: viewer },
        select: {
          user: {
            select: {
              signupCountry: true,
              settings: { select: { country: true } },
            },
          },
        },
      });
      viewerCountry = viewerCountryOf(profile?.user);
    }
    if (!promotionReaches(promotion.countries, viewerCountry)) return null;
    return {
      code: 'promoted',
      username: author,
      countries: (promotion.countries ?? '').split(',').filter(Boolean),
    };
  }
}
