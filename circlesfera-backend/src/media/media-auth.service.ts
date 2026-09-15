import { Injectable, Logger } from '@nestjs/common';
import { FollowStatus, Visibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Determines whether a given user (or anonymous visitor) is allowed
 * to access a media file served from `/uploads/`.
 *
 * Decision matrix:
 * ┌─────────────────────────┬───────────────────────────────────────────────┐
 * │ Condition               │ Allowed?                                     │
 * ├─────────────────────────┼───────────────────────────────────────────────┤
 * │ No matching PostMedia   │ Yes (avatars, public assets, etc.)           │
 * │ Post is PUBLIC + free   │ Yes                                          │
 * │ Post author == viewer   │ Yes                                          │
 * │ Post is PPV (isPremium) │ Only if viewer has a PostUnlock              │
 * │ Post is FOLLOWERS-only  │ Only if viewer follows the author            │
 * │ Post is PRIVATE (CF)    │ Only if viewer is in author's Close Friends  │
 * └─────────────────────────┴───────────────────────────────────────────────┘
 */
@Injectable()
export class MediaAuthService {
  private readonly logger = new Logger(MediaAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check whether `viewerProfileId` (may be null for anonymous) is allowed
   * to access the file at the given upload path.
   *
   * @returns `true` if access is granted, `false` if denied.
   */
  async isAccessAllowed(
    uploadPath: string,
    viewerUserId: string | null,
    viewerProfileId: string | null,
  ): Promise<boolean> {
    // 1. Find the PostMedia row whose url or standardUrl matches the upload path.
    //    We normalise to handle both "/uploads/foo/bar.jpg" and "foo/bar.jpg".
    const normalised = uploadPath.replace(/^\/uploads\//, '');

    // Direct access to GDPR export artifacts or private archives via static media path is forbidden
    if (normalised.startsWith('exports/') || uploadPath.includes('exports')) {
      this.logger.warn(
        `Direct static access to export artifact denied: ${uploadPath}`,
      );
      return false;
    }

    const media = await this.prisma.postMedia.findFirst({
      where: {
        OR: [
          { url: { contains: normalised } },
          { standardUrl: { contains: normalised } },
          { thumbnailUrl: { contains: normalised } },
        ],
      },
      select: {
        postId: true,
        post: {
          select: {
            profileId: true,
            visibility: true,
            isPremium: true,
          },
        },
      },
    });

    // If no PostMedia references this file, it's a public asset (avatar, etc.) → allow.
    if (!media) {
      return true;
    }

    const post = media.post;

    // 2. Public + free content → allow everyone.
    if (post.visibility === Visibility.PUBLIC && !post.isPremium) {
      return true;
    }

    // 3. From here on, a logged-in user is required.
    if (!viewerUserId || !viewerProfileId) {
      this.logger.debug(
        `Anonymous access denied for protected media: ${uploadPath}`,
      );
      return false;
    }

    // 4. The author can always view their own content.
    if (post.profileId === viewerProfileId) {
      return true;
    }

    // 5. PPV / Premium content → check PostUnlock.
    if (post.isPremium) {
      const unlock = await this.prisma.postUnlock.findUnique({
        where: {
          userId_postId: {
            userId: viewerUserId,
            postId: media.postId,
          },
        },
        select: { id: true },
      });
      if (unlock) {
        return true;
      }
      this.logger.debug(
        `PPV access denied for user ${viewerUserId} on post ${media.postId}`,
      );
      return false;
    }

    // 6. Followers-only → check Follow relationship.
    if (post.visibility === Visibility.FOLLOWERS) {
      const follow = await this.prisma.follow.findFirst({
        where: {
          followerId: viewerProfileId,
          followingId: post.profileId,
          status: FollowStatus.ACCEPTED,
        },
        select: { id: true },
      });
      if (follow) {
        return true;
      }
      this.logger.debug(
        `Followers-only access denied for ${viewerProfileId} on post ${media.postId}`,
      );
      return false;
    }

    // 7. Private (Close Friends) → check CloseFriend relationship.
    if (post.visibility === Visibility.PRIVATE) {
      const closeFriend = await this.prisma.closeFriend.findFirst({
        where: {
          profileId: post.profileId,
          friendId: viewerProfileId,
        },
        select: { id: true },
      });
      if (closeFriend) {
        return true;
      }
      this.logger.debug(
        `Close-friends access denied for ${viewerProfileId} on post ${media.postId}`,
      );
      return false;
    }

    // Default deny for any unexpected state.
    return false;
  }
}
