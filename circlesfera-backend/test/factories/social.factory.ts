import type {
  Block,
  CloseFriend,
  Comment,
  Follow,
  FollowStatus,
  Like,
  PrismaClient,
} from '@prisma/client';
import { generateTestSuffix } from './user.factory.js';

/**
 * Create a Follow relationship between two profiles.
 */
export async function createFollow(
  prisma: PrismaClient,
  followerId: string,
  followingId: string,
  status: FollowStatus = 'ACCEPTED',
): Promise<Follow> {
  return prisma.follow.upsert({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
    create: {
      followerId,
      followingId,
      status,
    },
    update: {
      status,
    },
  });
}

/**
 * Create a Block relationship between two profiles.
 */
export async function createBlock(
  prisma: PrismaClient,
  blockerId: string,
  blockedId: string,
): Promise<Block> {
  return prisma.block.upsert({
    where: {
      blockerId_blockedId: {
        blockerId,
        blockedId,
      },
    },
    create: {
      blockerId,
      blockedId,
    },
    update: {},
  });
}

/**
 * Add a profile to another profile's Close Friends list.
 */
export async function createCloseFriend(
  prisma: PrismaClient,
  profileId: string,
  friendId: string,
): Promise<CloseFriend> {
  return prisma.closeFriend.upsert({
    where: {
      profileId_friendId: {
        profileId,
        friendId,
      },
    },
    create: {
      profileId,
      friendId,
    },
    update: {},
  });
}

/**
 * Like a post on behalf of a profile.
 */
export async function createLike(
  prisma: PrismaClient,
  profileId: string,
  postId: string,
): Promise<Like> {
  return prisma.like.upsert({
    where: {
      postId_profileId: {
        postId,
        profileId,
      },
    },
    create: {
      profileId,
      postId,
    },
    update: {},
  });
}

/**
 * Create a comment on a post.
 */
export async function createComment(
  prisma: PrismaClient,
  profileId: string,
  postId: string,
  content?: string,
): Promise<Comment> {
  const suffix = generateTestSuffix();
  return prisma.comment.create({
    data: {
      profileId,
      postId,
      content: content ?? `Test comment #${suffix}`,
    },
  });
}
