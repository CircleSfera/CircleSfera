import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type Prisma, Visibility } from '@prisma/client';
import { isBlockedEitherWay } from './block.policy.js';

type PostAccessReader = Pick<
  Prisma.TransactionClient,
  'post' | 'block' | 'follow' | 'profile' | 'user'
>;

export type AccessiblePost = {
  id: string;
  profileId: string;
  visibility: Visibility;
  moderationStatus: string;
  turnOffComments: boolean;
  hideLikes?: boolean;
  profile?: {
    user?: { settings?: { privacyLevel: Visibility } | null } | null;
  } | null;
};

// Single read-access rule for a post, shared by every path that shows or
// engages with it (detail, comments, likes). Blocked viewers and moderated-out
// posts answer NotFound so neither the block nor the moderation is revealed;
// privacy and audience restrictions answer Forbidden, as the detail endpoint
// always has. The author always has access to their own post. Accepts a post
// id, or a post the caller already loaded with these fields (avoids a second
// query on the detail endpoint).
export async function assertCanAccessPost(
  db: PostAccessReader,
  postOrId: string | AccessiblePost,
  viewerProfileId?: string | null,
): Promise<AccessiblePost> {
  const post =
    typeof postOrId === 'string' ? await loadPost(db, postOrId) : postOrId;

  if (!post) throw new NotFoundException('Post not found');

  if (viewerProfileId === post.profileId) return post;

  if (
    post.moderationStatus === 'HIDDEN' ||
    post.moderationStatus === 'REMOVED' ||
    (await isBlockedEitherWay(db, viewerProfileId, post.profileId))
  ) {
    throw new NotFoundException('Post not found');
  }

  const isFollower = async () => {
    if (!viewerProfileId) return false;
    const follow = await db.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerProfileId,
          followingId: post.profileId,
        },
      },
      select: { status: true },
    });
    return follow?.status === 'ACCEPTED';
  };

  const isProfilePrivate =
    post.profile?.user?.settings?.privacyLevel === Visibility.PRIVATE;
  if (isProfilePrivate && !(await isFollower())) {
    throw new ForbiddenException('This account is private');
  }
  if (post.visibility === Visibility.PRIVATE) {
    throw new ForbiddenException('This post is private');
  }
  if (post.visibility === Visibility.FOLLOWERS && !(await isFollower())) {
    throw new ForbiddenException('This post is for followers only');
  }

  return post;
}

function loadPost(
  db: PostAccessReader,
  postId: string,
): Promise<AccessiblePost | null> {
  return db.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      profileId: true,
      visibility: true,
      moderationStatus: true,
      turnOffComments: true,
      hideLikes: true,
      profile: {
        select: {
          user: { select: { settings: { select: { privacyLevel: true } } } },
        },
      },
    },
  });
}
