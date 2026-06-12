import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  $Enums,
  type FollowStatus,
  type Profile,
  type User,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type NotificationType = $Enums.NotificationType;
const NotificationType = $Enums.NotificationType;

// Type definitions for return values
type FollowStatusResponse = { following: boolean; status: string };
type SuccessResponse = { success: boolean };
type UserWithProfile = User & { profile: Profile | null };

/**
 * Service for follow/unfollow, blocking, and follow request management.
 * Supports private accounts (pending follow requests) and user blocking.
 */
@Injectable()
export class FollowsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Toggle follow/unfollow for a user. Handles private accounts by creating pending requests.
   * @param followingUsername - Username of the user to follow/unfollow
   * @param followerId - The requesting user's ID
   * @returns Follow status (following: true/false, status: string)
   * @throws NotFoundException if target user not found
   * @throws BadRequestException if attempting to follow self
   */
  async toggle(
    followingUsername: string,
    followerId: string,
  ): Promise<FollowStatusResponse> {
    const profile = await this.prisma.profile.findUnique({
      where: { username: followingUsername },
    });

    if (!profile) {
      throw new NotFoundException('User not found');
    }

    const followingId = profile.userId;

    if (followerId === followingId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    // Check if blocked
    const block = await this.prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: followingId,
          blockedId: followerId,
        },
      },
    });

    if (block) {
      throw new NotFoundException('User not found'); // Mimic not found when blocked
    }

    const existingFollow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

    if (existingFollow) {
      // Unfollow (or cancel request)
      await this.prisma.follow.delete({ where: { id: existingFollow.id } });
      return { following: false, status: 'NONE' };
    } else {
      // Follow
      // Check privacy level from settings
      const targetUser = await this.prisma.user.findUnique({
        where: { id: followingId },
        include: { settings: true },
      });
      const isPrivate = targetUser?.settings?.privacyLevel === 'PRIVATE';

      const status: FollowStatus = isPrivate ? 'PENDING' : 'ACCEPTED';

      await this.prisma.follow.create({
        data: {
          followerId,
          followingId,
          status,
        },
      });

      // Create notification
      const notificationType: NotificationType = isPrivate
        ? NotificationType.FOLLOW_REQUEST
        : NotificationType.FOLLOW;
      const notificationContent = isPrivate
        ? 'requested to follow you'
        : 'started following you';

      await this.notificationsService.create({
        recipientId: followingId,
        senderId: followerId,
        type: notificationType,
        content: notificationContent,
      });

      return { following: status === 'ACCEPTED', status };
    }
  }

  /**
   * Check the follow status between the current user and a target user.
   * @param followingUsername - The target username
   * @param followerId - The current user's ID
   * @returns Follow status (following: boolean, status: string)
   */
  async checkFollow(
    followingUsername: string,
    followerId: string,
  ): Promise<FollowStatusResponse> {
    const profile = await this.prisma.profile.findUnique({
      where: { username: followingUsername },
    });

    if (!profile) {
      return { following: false, status: 'NONE' };
    }

    // Check block
    const block = await this.prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: profile.userId,
          blockedId: followerId,
        },
      },
    });

    if (block) return { following: false, status: 'BLOCKED' };

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: profile.userId,
        },
      },
    });

    return {
      following: follow?.status === 'ACCEPTED',
      status: follow?.status ?? 'NONE',
    };
  }

  /**
   * Get all followers of a user by username.
   * @param username - The profile username
   * @returns Array of follower users with profiles
   */
  async getFollowers(username: string): Promise<UserWithProfile[]> {
    const profile = await this.prisma.profile.findUnique({
      where: { username },
    });

    if (!profile) throw new NotFoundException('User not found');

    const followers = await this.prisma.follow.findMany({
      where: {
        followingId: profile.userId,
        status: 'ACCEPTED',
      },
      include: {
        follower: {
          include: { profile: true },
        },
      },
    });

    return followers.map((f) => f.follower);
  }

  /**
   * Get all users that a user is following.
   * @param username - The profile username
   * @returns Array of followed users with profiles
   */
  async getFollowing(username: string): Promise<UserWithProfile[]> {
    const profile = await this.prisma.profile.findUnique({
      where: { username },
    });

    if (!profile) throw new NotFoundException('User not found');

    const following = await this.prisma.follow.findMany({
      where: {
        followerId: profile.userId,
        status: 'ACCEPTED',
      },
      include: {
        following: {
          include: { profile: true },
        },
      },
    });

    return following.map((f) => f.following);
  }

  /**
   * Block a user. Also removes any existing follow relationships.
   * @param blockerId - The blocking user's ID
   * @param blockedUsername - Username of the user to block
   * @throws NotFoundException if target user not found
   */
  async blockUser(
    blockerId: string,
    blockedUsername: string,
  ): Promise<SuccessResponse> {
    const profile = await this.prisma.profile.findUnique({
      where: { username: blockedUsername },
    });
    if (!profile) throw new NotFoundException('User not found');

    const blockedId = profile.userId;
    if (blockerId === blockedId)
      throw new BadRequestException('Cannot block yourself');

    // Create block
    await this.prisma.block.create({
      data: { blockerId, blockedId },
    });

    // Remove any existing follows (both directions)
    await this.prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId },
        ],
      },
    });
    return { success: true };
  }

  /**
   * Unblock a previously blocked user.
   * @param blockerId - The blocking user's ID
   * @param blockedUsername - Username to unblock
   * @throws NotFoundException if target user not found
   */
  async unblockUser(
    blockerId: string,
    blockedUsername: string,
  ): Promise<SuccessResponse> {
    const profile = await this.prisma.profile.findUnique({
      where: { username: blockedUsername },
    });
    if (!profile) throw new NotFoundException('User not found');

    await this.prisma.block.delete({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId: profile.userId,
        },
      },
    });

    return { success: true };
  }

  /**
   * Get all users blocked by the current user.
   * @param userId - The authenticated user's ID
   */
  async getBlockedUsers(userId: string): Promise<UserWithProfile[]> {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: userId },
      include: {
        blocked: { include: { profile: true } },
      },
    });
    return blocks.map((b) => b.blocked);
  }

  /**
   * Get all pending follow requests for the current user (private account).
   * @param userId - The authenticated user's ID
   */
  async getPendingRequests(userId: string): Promise<UserWithProfile[]> {
    const pendingFollows = await this.prisma.follow.findMany({
      where: {
        followingId: userId,
        status: 'PENDING',
      },
      include: {
        follower: { include: { profile: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return pendingFollows.map((f) => f.follower);
  }

  /**
   * Accept a pending follow request from a specific user.
   * @param userId - The authenticated user's ID (the one being followed)
   * @param requesterUsername - Username of the requester
   * @throws NotFoundException if no pending request found
   */
  async acceptFollowRequest(
    userId: string,
    requesterUsername: string,
  ): Promise<SuccessResponse> {
    const requesterProfile = await this.prisma.profile.findUnique({
      where: { username: requesterUsername },
    });
    if (!requesterProfile) throw new NotFoundException('User not found');

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: requesterProfile.userId,
          followingId: userId,
        },
      },
    });

    if (!follow || follow.status !== 'PENDING') {
      throw new NotFoundException('Follow request not found');
    }

    await this.prisma.follow.update({
      where: { id: follow.id },
      data: { status: 'ACCEPTED' },
    });

    // Create notification for acceptance
    await this.notificationsService.create({
      recipientId: requesterProfile.userId,
      senderId: userId,
      type: NotificationType.FOLLOW_ACCEPTED,
      content: 'accepted your follow request',
    });

    return { success: true };
  }

  /**
   * Reject and delete a pending follow request.
   * @param userId - The authenticated user's ID
   * @param requesterUsername - Username of the requester to reject
   * @throws NotFoundException if no pending request found
   */
  async rejectFollowRequest(
    userId: string,
    requesterUsername: string,
  ): Promise<SuccessResponse> {
    const requesterProfile = await this.prisma.profile.findUnique({
      where: { username: requesterUsername },
    });
    if (!requesterProfile) throw new NotFoundException('User not found');

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: requesterProfile.userId,
          followingId: userId,
        },
      },
    });

    if (!follow || follow.status !== 'PENDING') {
      throw new NotFoundException('Follow request not found');
    }

    await this.prisma.follow.delete({ where: { id: follow.id } });

    return { success: true };
  }
}
