import { NotFoundException } from '@nestjs/common';
import { Visibility } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { isBlockedEitherWay } from './block.policy.js';

type PrismaReader = Pick<
  PrismaService,
  'story' | 'follow' | 'closeFriend' | 'block'
>;

/**
 * Viewing, reacting to, answering or sharing a story requires the same access
 * as seeing it: not hidden or removed by moderation, no block either way, a
 * follow for private accounts, and close-friend membership for
 * close-friends-only stories. Every denial answers NotFound so restrictions
 * are never revealed. Answers the author and when the story ends.
 */
export async function assertCanAccessStory(
  prisma: PrismaReader,
  storyId: string,
  viewerProfileId: string,
): Promise<{ profileId: string; expiresAt: Date }> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      profileId: true,
      expiresAt: true,
      isCloseFriendsOnly: true,
      moderationStatus: true,
      profile: { select: { privacyLevel: true } },
    },
  });
  // A story removed by moderation is kept for six months and shown to
  // nobody, its author included.
  if (!story || story.moderationStatus === 'REMOVED') {
    throw new NotFoundException('Story not found');
  }
  const result = { profileId: story.profileId, expiresAt: story.expiresAt };
  if (story.profileId === viewerProfileId) return result;

  if (story.moderationStatus === 'HIDDEN') {
    throw new NotFoundException('Story not found');
  }

  if (
    await isBlockedEitherWay(
      prisma as PrismaService,
      viewerProfileId,
      story.profileId,
    )
  ) {
    throw new NotFoundException('Story not found');
  }

  if (story.profile.privacyLevel === Visibility.PRIVATE) {
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerProfileId,
          followingId: story.profileId,
        },
      },
      select: { status: true },
    });
    if (follow?.status !== 'ACCEPTED') {
      throw new NotFoundException('Story not found');
    }
  }

  if (story.isCloseFriendsOnly) {
    const closeFriend = await prisma.closeFriend.findUnique({
      where: {
        profileId_friendId: {
          profileId: story.profileId,
          friendId: viewerProfileId,
        },
      },
      select: { id: true },
    });
    if (!closeFriend) throw new NotFoundException('Story not found');
  }
  return result;
}
