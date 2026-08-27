import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  $Enums,
  type FollowStatus,
  type Profile,
  type User,
} from '@prisma/client';
import { assertEmailVerifiedForWrite } from '../common/abuse/assert-email-verified.js';
import { TurnstileService } from '../common/abuse/turnstile.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';

type NotificationType = $Enums.NotificationType;
const NotificationType = $Enums.NotificationType;

// Type definitions for return values
type FollowStatusResponse = { following: boolean; status: string };
type SuccessResponse = { success: boolean };
type ProfileWithUser = Profile & { user: User };

/**
 * Service for follow/unfollow, blocking, and follow request management.
 * Supports private accounts (pending follow requests) and user blocking.
 */
@Injectable()
export class FollowsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(SystemSettingsService)
    private readonly systemSettings: SystemSettingsService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
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
    userId: string,
  ): Promise<FollowStatusResponse> {
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: followingUsername, mode: 'insensitive' } },
    });

    if (!profile) {
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');
    }

    const followingId = profile.id;

    if (followerId === followingId) {
      throw AppException.BadRequest(
        ErrorCode.CANNOT_FOLLOW_SELF,
        'You cannot follow yourself',
      );
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
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found'); // Mimic not found when blocked
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
      await assertEmailVerifiedForWrite(
        this.prisma,
        this.systemSettings,
        this.turnstile,
        userId,
      );
      // Follow
      // Check privacy level from settings
      const targetUser = await this.prisma.user.findUnique({
        where: { id: profile.userId },
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

      this.eventEmitter.emit('notification.create', {
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
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: followingUsername, mode: 'insensitive' } },
    });

    if (!profile) {
      return { following: false, status: 'NONE' };
    }

    // Check block
    const block = await this.prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: profile.id,
          blockedId: followerId,
        },
      },
    });

    if (block) return { following: false, status: 'BLOCKED' };

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: profile.id,
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
  async getFollowers(username: string): Promise<ProfileWithUser[]> {
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });

    if (!profile)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const followers = await this.prisma.follow.findMany({
      where: {
        followingId: profile.id,
        status: 'ACCEPTED',
      },
      include: {
        follower: {
          include: { user: true },
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
  async getFollowing(username: string): Promise<ProfileWithUser[]> {
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });

    if (!profile)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const following = await this.prisma.follow.findMany({
      where: {
        followerId: profile.id,
        status: 'ACCEPTED',
      },
      include: {
        following: {
          include: { user: true },
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
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: blockedUsername, mode: 'insensitive' } },
    });
    if (!profile)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const blockedId = profile.id;
    if (blockerId === blockedId)
      throw AppException.BadRequest(
        ErrorCode.CANNOT_BLOCK_SELF,
        'Cannot block yourself',
      );

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
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: blockedUsername, mode: 'insensitive' } },
    });
    if (!profile)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    await this.prisma.block.delete({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId: profile.id,
        },
      },
    });

    return { success: true };
  }

  /**
   * Get all users blocked by the current user.
   * @param profileId - The authenticated user's ID
   */
  async getBlockedUsers(profileId: string): Promise<ProfileWithUser[]> {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: profileId },
      include: {
        blocked: { include: { user: true } },
      },
    });
    return blocks.map((b) => b.blocked);
  }

  /**
   * Mute a user.
   * @param muterId - The muting user's ID
   * @param mutedUsername - Username of the user to mute
   * @throws NotFoundException if target user not found
   */
  async muteUser(
    muterId: string,
    mutedUsername: string,
  ): Promise<SuccessResponse> {
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: mutedUsername, mode: 'insensitive' } },
    });
    if (!profile)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const mutedId = profile.id;
    if (muterId === mutedId)
      throw AppException.BadRequest(
        ErrorCode.CANNOT_MUTE_SELF,
        'Cannot mute yourself',
      );

    await this.prisma.mute.upsert({
      where: {
        muterId_mutedId: {
          muterId,
          mutedId,
        },
      },
      create: { muterId, mutedId },
      update: {},
    });

    return { success: true };
  }

  /**
   * Unmute a previously muted user.
   * @param muterId - The muting user's ID
   * @param mutedUsername - Username to unmute
   * @throws NotFoundException if target user not found
   */
  async unmuteUser(
    muterId: string,
    mutedUsername: string,
  ): Promise<SuccessResponse> {
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: mutedUsername, mode: 'insensitive' } },
    });
    if (!profile)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    try {
      await this.prisma.mute.delete({
        where: {
          muterId_mutedId: {
            muterId,
            mutedId: profile.id,
          },
        },
      });
    } catch {
      // Ignore if not muted
    }

    return { success: true };
  }

  /**
   * Get all users muted by the current user.
   * @param profileId - The authenticated user's ID
   */
  async getMutedUsers(profileId: string): Promise<ProfileWithUser[]> {
    const mutes = await this.prisma.mute.findMany({
      where: { muterId: profileId },
      include: {
        muted: { include: { user: true } },
      },
    });
    return mutes.map((m) => m.muted);
  }

  /**
   * Get all pending follow requests for the current user (private account).
   * @param profileId - The authenticated user's ID
   */
  async getPendingRequests(profileId: string): Promise<ProfileWithUser[]> {
    const pendingFollows = await this.prisma.follow.findMany({
      where: {
        followingId: profileId,
        status: 'PENDING',
      },
      include: {
        follower: { include: { user: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return pendingFollows.map((f) => f.follower);
  }

  /**
   * Accept a pending follow request from a specific user.
   * @param profileId - The authenticated user's ID (the one being followed)
   * @param requesterUsername - Username of the requester
   * @throws NotFoundException if no pending request found
   */
  async acceptFollowRequest(
    profileId: string,
    requesterUsername: string,
  ): Promise<SuccessResponse> {
    const requesterProfile = await this.prisma.profile.findFirst({
      where: { username: { equals: requesterUsername, mode: 'insensitive' } },
    });
    if (!requesterProfile)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: requesterProfile.id,
          followingId: profileId,
        },
      },
    });

    if (follow?.status !== 'PENDING') {
      throw AppException.NotFound(
        ErrorCode.FOLLOW_REQUEST_NOT_FOUND,
        'Follow request not found',
      );
    }

    await this.prisma.follow.update({
      where: { id: follow.id },
      data: { status: 'ACCEPTED' },
    });

    // Create notification for acceptance
    this.eventEmitter.emit('notification.create', {
      recipientId: requesterProfile.id,
      senderId: profileId,
      type: NotificationType.FOLLOW_ACCEPTED,
      content: 'accepted your follow request',
    });

    return { success: true };
  }

  /**
   * Reject and delete a pending follow request.
   * @param profileId - The authenticated user's ID
   * @param requesterUsername - Username of the requester to reject
   * @throws NotFoundException if no pending request found
   */
  async rejectFollowRequest(
    profileId: string,
    requesterUsername: string,
  ): Promise<SuccessResponse> {
    const requesterProfile = await this.prisma.profile.findFirst({
      where: { username: { equals: requesterUsername, mode: 'insensitive' } },
    });
    if (!requesterProfile)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: requesterProfile.id,
          followingId: profileId,
        },
      },
    });

    if (follow?.status !== 'PENDING') {
      throw AppException.NotFound(
        ErrorCode.FOLLOW_REQUEST_NOT_FOUND,
        'Follow request not found',
      );
    }

    await this.prisma.follow.delete({ where: { id: follow.id } });

    return { success: true };
  }
}
