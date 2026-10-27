import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type Prisma, Visibility } from '@prisma/client';
import { isBlockedEitherWay } from './block.policy.js';
import { isGone } from './removed-content.policy.js';

type PostAccessReader = Pick<
  Prisma.TransactionClient,
  'post' | 'block' | 'follow' | 'profile' | 'user'
>;

export type AccessiblePost = {
  id: string;
  profileId: string;
  visibility: Visibility;
  moderationStatus: string;
  deletedAt: Date | null;
  archivedAt?: Date | null;
  turnOffComments: boolean;
  hideLikes?: boolean;
  profile?: { privacyLevel?: Visibility } | null;
};

// Single read-access rule for a post, shared by every path that shows or
// engages with it (detail, comments, likes). Blocked viewers and moderated-out
// posts answer NotFound so neither the block nor the moderation is revealed;
// privacy and audience restrictions answer Forbidden, as the detail endpoint
// always has. The author has access to their own post unless moderation
// removed it or they deleted it (it is then only in their Recently deleted,
// which reads it on its own). A post its author archived is theirs only: they
// open it from their archive, and anyone else is answered NotFound. Accepts a
// post id, or a post the caller already loaded with these fields (avoids a
// second query on the detail endpoint).
export async function assertCanAccessPost(
  db: PostAccessReader,
  postOrId: string | AccessiblePost,
  viewerProfileId?: string | null,
): Promise<AccessiblePost> {
  const post =
    typeof postOrId === 'string' ? await loadPost(db, postOrId) : postOrId;

  // A post removed by moderation is kept for its appeal, and one its author
  // deleted waits in their Recently deleted: both are shown to nobody here,
  // the author included.
  if (!post || isGone(post)) {
    throw new NotFoundException('Post not found');
  }

  if (viewerProfileId === post.profileId) return post;

  if (
    post.archivedAt ||
    post.moderationStatus === 'HIDDEN' ||
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

  const isProfilePrivate = post.profile?.privacyLevel === Visibility.PRIVATE;
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
      deletedAt: true,
      archivedAt: true,
      turnOffComments: true,
      hideLikes: true,
      profile: { select: { privacyLevel: true } },
    },
  });
}
