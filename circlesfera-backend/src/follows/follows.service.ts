import { ErrorCode, type NotificationCreateEvent } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  $Enums,
  type FollowStatus,
  type Prisma,
  type Profile,
} from '@prisma/client';
import { assertEmailVerifiedForWrite } from '../common/abuse/assert-email-verified.js';
import { TurnstileService } from '../common/abuse/turnstile.service.js';
import { AppException } from '../common/errors/app.exception.js';
import {
  decodeKeysetCursor,
  type KeysetPage,
  keysetBeforeDesc,
  toKeysetPage,
} from '../common/pagination/keyset.util.js';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import { viewerAudienceWhere } from '../common/policies/test-account.policy.js';
import { PUBLIC_USER_SELECT } from '../common/selects/public-user.select.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import {
  activeMuteWhere,
  type MuteDuration,
  muteExpiresAtFromDuration,
} from './mute.util.js';

type NotificationType = $Enums.NotificationType;
const NotificationType = $Enums.NotificationType;

// Type definitions for return values
type FollowStatusResponse = { following: boolean; status: string };
type SuccessResponse = { success: boolean; expiresAt?: string | null };
export type ProfileWithUser = Profile & {
  user: Prisma.UserGetPayload<{ select: typeof PUBLIC_USER_SELECT }>;
};
export type MutedUserEntry = {
  createdAt: Date;
  expiresAt: Date | null;
  profile: ProfileWithUser;
};

// Service for follow/unfollow, blocking, and follow request management.
// Supports private accounts (pending follow requests) and user blocking.
@Injectable()
export class FollowsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(SystemSettingsService)
    private readonly systemSettings: SystemSettingsService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
  ) {}

  // Toggle follow/unfollow for a user. Handles private accounts by creating pending requests.
  // Param followingUsername: Username of the user to follow/unfollow
  // Param followerId: The requesting user's ID
  // Returns Follow status (following: true/false, status: string)
  // Throws NotFoundException if target user not found
  // Throws BadRequestException if attempting to follow self
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

    // A block in either direction hides the target.
    if (await isBlockedEitherWay(this.prisma, followerId, followingId)) {
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');
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
      } satisfies NotificationCreateEvent['payload']);

      return { following: status === 'ACCEPTED', status };
    }
  }

  // Check the follow status between the current user and a target user.
  // Param followingUsername: The target username
  // Param followerId: The current user's ID
  // Returns Follow status (following: boolean, status: string)
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

    // BLOCKED is only reported to the blocker, so the UI can offer Unblock.
    // A blocked viewer sees NONE and never learns about the block.
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: followerId, blockedId: profile.id },
          { blockerId: profile.id, blockedId: followerId },
        ],
      },
      select: { blockerId: true },
    });
    if (blocks.some((b) => b.blockerId === followerId)) {
      return { following: false, status: 'BLOCKED' };
    }
    if (blocks.length > 0) return { following: false, status: 'NONE' };

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

  // Get followers of a user by username, newest first. Cursor/keyset
  // pagination — stable under concurrent follows, unlike
  // skip/take: a new follower inserted ahead of the cursor never shifts an
  // already-fetched page.
  // Param username: The profile username
  // Param cursor: opaque cursor from the previous page's nextCursor
  // Param limit: page size, default 20, capped at 100
  async getFollowers(
    username: string,
    cursor?: string,
    limit = 20,
    viewerProfileId?: string,
  ): Promise<KeysetPage<ProfileWithUser>> {
    const cappedLimit = Math.min(limit, 100);
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });

    if (
      !profile ||
      (await isBlockedEitherWay(this.prisma, viewerProfileId, profile.id))
    )
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const decoded = cursor ? decodeKeysetCursor(cursor) : null;
    const cursorWhere = decoded ? keysetBeforeDesc(decoded) : {};

    const followers = await this.prisma.follow.findMany({
      where: {
        followingId: profile.id,
        status: 'ACCEPTED',
        follower: await viewerAudienceWhere(this.prisma, viewerProfileId),
        ...cursorWhere,
      },
      include: {
        follower: {
          include: { user: { select: PUBLIC_USER_SELECT } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: cappedLimit + 1,
    });

    const page = toKeysetPage(followers, cappedLimit);
    return { ...page, data: page.data.map((f) => f.follower) };
  }

  // Get users that a user is following, newest first. Same cursor/keyset
  // pagination as getFollowers.
  // Param username: The profile username
  // Param cursor: opaque cursor from the previous page's nextCursor
  // Param limit: page size, default 20, capped at 100
  async getFollowing(
    username: string,
    cursor?: string,
    limit = 20,
    viewerProfileId?: string,
  ): Promise<KeysetPage<ProfileWithUser>> {
    const cappedLimit = Math.min(limit, 100);
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });

    if (
      !profile ||
      (await isBlockedEitherWay(this.prisma, viewerProfileId, profile.id))
    )
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const decoded = cursor ? decodeKeysetCursor(cursor) : null;
    const cursorWhere = decoded ? keysetBeforeDesc(decoded) : {};

    const following = await this.prisma.follow.findMany({
      where: {
        followerId: profile.id,
        status: 'ACCEPTED',
        following: await viewerAudienceWhere(this.prisma, viewerProfileId),
        ...cursorWhere,
      },
      include: {
        following: {
          include: { user: { select: PUBLIC_USER_SELECT } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: cappedLimit + 1,
    });

    const page = toKeysetPage(following, cappedLimit);
    return { ...page, data: page.data.map((f) => f.following) };
  }

  // Block a user. Also removes follow and close-friend relationships in both
  // directions.
  // Param blockerId: The blocking user's ID
  // Param blockedUsername: Username of the user to block
  // Throws NotFoundException if target user not found
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

    // Idempotent and atomic: repeating a block is a no-op, and the
    // block, the follow removal and the close-friends removal happen together.
    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      }),
      this.prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followingId: blockedId },
            { followerId: blockedId, followingId: blockerId },
          ],
        },
      }),
      this.prisma.closeFriend.deleteMany({
        where: {
          OR: [
            { profileId: blockerId, friendId: blockedId },
            { profileId: blockedId, friendId: blockerId },
          ],
        },
      }),
    ]);
    return { success: true };
  }

  // Unblock a previously blocked user.
  // Param blockerId: The blocking user's ID
  // Param blockedUsername: Username to unblock
  // Throws NotFoundException if target user not found
  async unblockUser(
    blockerId: string,
    blockedUsername: string,
  ): Promise<SuccessResponse> {
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: blockedUsername, mode: 'insensitive' } },
    });
    if (!profile)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    // Idempotent: unblocking someone who is not blocked is a no-op.
    await this.prisma.block.deleteMany({
      where: { blockerId, blockedId: profile.id },
    });

    return { success: true };
  }

  // Get all users blocked by the current user.
  // Param profileId: The authenticated user's ID
  async getBlockedUsers(profileId: string): Promise<ProfileWithUser[]> {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: profileId },
      include: {
        blocked: { include: { user: { select: PUBLIC_USER_SELECT } } },
      },
    });
    return blocks.map((b) => b.blocked);
  }

  // Mute a user for an optional duration (`forever` when omitted).
  // Param muterId: The muting user's ID
  // Param mutedUsername: Username of the user to mute
  // Param duration: 24h | 7d | 30d | forever
  // Throws NotFoundException if target user not found
  async muteUser(
    muterId: string,
    mutedUsername: string,
    duration?: MuteDuration,
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

    const expiresAt = muteExpiresAtFromDuration(duration);

    await this.prisma.mute.upsert({
      where: {
        muterId_mutedId: {
          muterId,
          mutedId,
        },
      },
      create: { muterId, mutedId, expiresAt },
      update: { expiresAt },
    });

    return {
      success: true,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };
  }

  // Unmute a previously muted user.
  // Param muterId: The muting user's ID
  // Param mutedUsername: Username to unmute
  // Throws NotFoundException if target user not found
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

  // Get all users currently muted by the current user (expired rows are cleaned up).
  // Param profileId: The authenticated user's ID
  async getMutedUsers(profileId: string): Promise<MutedUserEntry[]> {
    await this.prisma.mute.deleteMany({
      where: {
        muterId: profileId,
        expiresAt: { lte: new Date() },
      },
    });

    const mutes = await this.prisma.mute.findMany({
      where: activeMuteWhere(profileId),
      include: {
        muted: { include: { user: { select: PUBLIC_USER_SELECT } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return mutes.map((m) => ({
      createdAt: m.createdAt,
      expiresAt: m.expiresAt,
      profile: m.muted,
    }));
  }

  // Get all pending follow requests for the current user (private account).
  // Param profileId: The authenticated user's ID
  async getPendingRequests(profileId: string): Promise<ProfileWithUser[]> {
    const pendingFollows = await this.prisma.follow.findMany({
      where: {
        followingId: profileId,
        status: 'PENDING',
      },
      include: {
        follower: { include: { user: { select: PUBLIC_USER_SELECT } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return pendingFollows.map((f) => f.follower);
  }

  // Accept a pending follow request from a specific user.
  // Param profileId: The authenticated user's ID (the one being followed)
  // Param requesterUsername: Username of the requester
  // Throws NotFoundException if no pending request found
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
    } satisfies NotificationCreateEvent['payload']);

    return { success: true };
  }

  // Reject and delete a pending follow request.
  // Param profileId: The authenticated user's ID
  // Param requesterUsername: Username of the requester to reject
  // Throws NotFoundException if no pending request found
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
