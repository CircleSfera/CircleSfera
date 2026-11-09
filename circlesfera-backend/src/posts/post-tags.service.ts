import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { type PostTagStatus, Visibility } from '@prisma/client';
import { loadViewerContent } from '../common/content/viewer-content.js';
import { AppException } from '../common/errors/app.exception.js';
import { getBlockedProfileIds } from '../common/policies/block.policy.js';
import { LISTED_POST } from '../common/policies/removed-content.policy.js';
import { PUBLIC_PROFILE_SELECT } from '../common/selects/public-profile.select.js';
import { PrismaService } from '../prisma/prisma.service.js';

// The most tags listed at once.
const TAGS_PAGE = 100;

// The active Profile's tags on others' posts: the ones waiting for its
// approval and the ones shown on its profile. It approves a waiting one, or
// takes itself off any post. The post's author is never told.
@Injectable()
export class PostTagsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Every tag of the Profile on a post that is still up and not across a
  // block. What it may see of each post follows the post's own page: the
  // details only when it may open it (shown by moderation, and public on a
  // public profile or for the author's accepted followers), and the content
  // preferences of the Profile on top. On a post it cannot open, the row
  // keeps only what removing the tag needs.
  async list(profileId: string, status: PostTagStatus) {
    const [blocked, content] = await Promise.all([
      getBlockedProfileIds(this.prisma, profileId),
      loadViewerContent(this.prisma, profileId),
    ]);
    const rows = await this.prisma.postTag.findMany({
      where: {
        profileId,
        status,
        post: {
          ...LISTED_POST,
          ...(blocked.length > 0 && { profileId: { notIn: blocked } }),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: TAGS_PAGE,
      select: {
        createdAt: true,
        status: true,
        post: {
          select: {
            id: true,
            profileId: true,
            caption: true,
            isPremium: true,
            contentRating: true,
            visibility: true,
            moderationStatus: true,
            createdAt: true,
            profile: { select: PUBLIC_PROFILE_SELECT },
            media: {
              orderBy: { order: 'asc' },
              take: 1,
              select: { thumbnailUrl: true, url: true, type: true },
            },
          },
        },
      },
    });

    const authors = [...new Set(rows.map((r) => r.post.profileId))];
    const followed = new Set(
      authors.length === 0
        ? []
        : (
            await this.prisma.follow.findMany({
              where: {
                followerId: profileId,
                followingId: { in: authors },
                status: 'ACCEPTED',
              },
              select: { followingId: true },
            })
          ).map((f) => f.followingId),
    );
    const canOpen = (post: (typeof rows)[number]['post']) => {
      // Hidden while staff review it, as on the post's page.
      if (post.moderationStatus === 'HIDDEN') return false;
      const follows = followed.has(post.profileId);
      if (post.profile.privacyLevel === Visibility.PRIVATE && !follows) {
        return false;
      }
      if (post.visibility === Visibility.PUBLIC) return true;
      return post.visibility === Visibility.FOLLOWERS && follows;
    };

    return {
      data: rows.map(({ post, ...tag }) => {
        if (!canOpen(post)) {
          return {
            ...tag,
            canOpen: false,
            post: {
              id: post.id,
              caption: null,
              createdAt: post.createdAt,
              thumbnailUrl: null,
              profile: null,
            },
          };
        }
        const mature = post.contentRating !== 'GENERAL';
        // A paid post shows no picture: the tag is not a way into it. A
        // mature one shows none to a Profile that blurs or does not allow
        // them, and no caption either when it does not allow them.
        const noPicture =
          post.isPremium ||
          (mature && (content.blurSensitiveContent || !content.allowMature));
        const first = post.media[0];
        return {
          ...tag,
          canOpen: true,
          post: {
            id: post.id,
            caption: mature && !content.allowMature ? null : post.caption,
            createdAt: post.createdAt,
            thumbnailUrl: noPicture
              ? null
              : (first?.thumbnailUrl ??
                (first?.type === 'image' ? first.url : null)),
            profile: post.profile,
          },
        };
      }),
    };
  }

  // Shows on the Profile a tag that was waiting for its approval.
  async approve(postId: string, profileId: string) {
    const { count } = await this.prisma.postTag.updateMany({
      where: { postId, profileId, status: 'PENDING' },
      data: { status: 'SHOWN' },
    });
    if (count === 0) this.notFound();
    return { postId, status: 'SHOWN' as const };
  }

  // Takes the Profile off a post's tags, waiting or shown.
  async remove(postId: string, profileId: string) {
    const { count } = await this.prisma.postTag.deleteMany({
      where: { postId, profileId },
    });
    if (count === 0) this.notFound();
    return { postId, removed: true };
  }

  private notFound(): never {
    throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Tag not found');
  }
}
