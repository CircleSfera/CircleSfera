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

  // Only posts the Profile may open are listed, as the post's own page
  // decides: shown by moderation, not across a block, and public on a
  // public profile or for the author's accepted followers. A tag on a post
  // it cannot open is still taken off with remove().
  async list(profileId: string, status: PostTagStatus) {
    const [blocked, content] = await Promise.all([
      getBlockedProfileIds(this.prisma, profileId),
      loadViewerContent(this.prisma, profileId),
    ]);
    const followsAuthor = {
      followers: {
        some: { followerId: profileId, status: 'ACCEPTED' as const },
      },
    };
    const rows = await this.prisma.postTag.findMany({
      where: {
        profileId,
        status,
        post: {
          ...LISTED_POST,
          // Hidden while staff review it, as on the post's page.
          moderationStatus: { notIn: ['REMOVED', 'HIDDEN'] },
          ...(blocked.length > 0 && { profileId: { notIn: blocked } }),
          OR: [
            {
              visibility: Visibility.PUBLIC,
              profile: { privacyLevel: Visibility.PUBLIC },
            },
            {
              visibility: { in: [Visibility.PUBLIC, Visibility.FOLLOWERS] },
              profile: followsAuthor,
            },
          ],
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
            caption: true,
            isPremium: true,
            contentRating: true,
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
    // A paid post shows no picture here: the tag is not a way into it. Nor
    // does a mature one for a Profile that does not allow them; it stays
    // listed so the Profile can take itself off it.
    return {
      data: rows.map(({ post, ...tag }) => {
        const { media, isPremium, contentRating, ...rest } = post;
        const first = media[0];
        const hidden =
          isPremium || (contentRating !== 'GENERAL' && !content.allowMature);
        return {
          ...tag,
          post: {
            ...rest,
            thumbnailUrl: hidden
              ? null
              : (first?.thumbnailUrl ??
                (first?.type === 'image' ? first.url : null)),
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
