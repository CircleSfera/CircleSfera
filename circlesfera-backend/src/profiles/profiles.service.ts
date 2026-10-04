import { ErrorCode } from '@circlesfera/shared';
import { InjectQueue } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import {
  type AccountType,
  SubscriptionStatus,
  Visibility,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import type { Cache } from 'cache-manager';
import {
  accountStanding,
  lastActiveBucket,
} from '../common/abuse/trust-score.js';
import { AppException } from '../common/errors/app.exception.js';
import {
  isBlockedEitherWay,
  visibleToViewerWhere,
} from '../common/policies/block.policy.js';
import { buildMediaCreateInput } from '../common/utils/media-lifecycle.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { activeStrikeWhere } from '../strikes/profile-strikes.constants.js';
import { UsersService } from '../users/users.service.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

// Service for profile CRUD, username validation, and account lifecycle (deactivate/delete).
// Uses cache-manager for profile read caching.
@Injectable()
export class ProfilesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectQueue('ai-processing') private readonly aiQueue: Queue,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  private buildProfileEmbeddingText(profile: {
    username: string;
    fullName?: string | null;
    bio?: string | null;
  }) {
    return [profile.username, profile.fullName, profile.bio]
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  private async enqueueProfileEmbedding(
    profileId: string,
    text: string,
  ): Promise<void> {
    if (!text) return;
    await this.aiQueue.add('generate-profile-embedding', {
      profileId,
      text,
    });
  }

  // Blocked in either direction: treated as not-found, same as a private/nonexistent profile
  // would be, so the response never reveals that a block exists.
  // Blocked pairs and other audiences answer as if the profile did
  // not exist. Applies to anonymous viewers too: they never see Test Accounts.
  private async assertNotBlocked(
    viewerProfileId: string | undefined,
    targetProfileId: string,
  ): Promise<void> {
    if (
      await isBlockedEitherWay(this.prisma, viewerProfileId, targetProfileId)
    ) {
      throw AppException.NotFound(
        ErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
      );
    }
  }

  // Get a public profile by username. Cached for 10 minutes.
  // Param username: The profile username
  // Param viewerProfileId: The authenticated viewer's profile, if any (route allows anonymous access)
  // Throws NotFoundException if profile does not exist or either side has blocked the other
  async getProfile(username: string, viewerProfileId?: string) {
    const cacheKey = `profile:${username}`;
    const cachedProfile = await this.cacheManager.get<{ id: string }>(cacheKey);
    if (cachedProfile) {
      await this.assertNotBlocked(viewerProfileId, cachedProfile.id);
      return cachedProfile;
    }

    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      include: {
        user: {
          select: {
            id: true,
            createdAt: true,
            lastSeenAt: true,
            isActive: true,
            emailVerified: true,
            identityVerifiedAt: true,
            signupCountry: true,
            botLabeledAt: true,

            settings: {
              select: {
                privacyLevel: true,
              },
            },
          },
        },
        _count: {
          select: {
            posts: true,
            followers: { where: { status: 'ACCEPTED' } },
            following: { where: { status: 'ACCEPTED' } },
            strikes: { where: activeStrikeWhere() },
          },
        },
      },
    });

    if (!profile) {
      throw AppException.NotFound(
        ErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
      );
    }

    await this.assertNotBlocked(viewerProfileId, profile.id);

    // Check if user is verified via subscription (PlatformSubscription is on User)
    const isVerifiedResult = await this.prisma.platformSubscription.findFirst({
      where: {
        userId: profile.userId,
        status: SubscriptionStatus.ACTIVE,
        plan: { features: { has: 'verified_badge' } },
      },
      select: { id: true },
    });

    const planVerified =
      !!isVerifiedResult ||
      profile.verificationLevel === 'VERIFIED' ||
      profile.verificationLevel === 'ELITE' ||
      profile.verificationLevel === 'BUSINESS';

    // Never expose email, role, or abuse hashes on the public profile.
    const { user, ...profileRest } = profile;
    const profileWithFields = {
      ...profileRest,
      user: user
        ? {
            id: user.id,
            createdAt: user.createdAt,
          }
        : undefined,
      verificationLevel: profile.verificationLevel,
      accountType: profile.accountType,
      privacyLevel: user?.settings?.privacyLevel || Visibility.PUBLIC,
      isPrivate: user?.settings?.privacyLevel === Visibility.PRIVATE,
      isVerified: planVerified,
      identityVerified: !!user?.identityVerifiedAt,
      emailConfirmed: !!user?.emailVerified,
      joinedAt: user?.createdAt?.toISOString?.() ?? user?.createdAt,
      signupCountry: user?.signupCountry ?? null,
      // Active strikes of this Profile; warnings are not shown.
      strikeCount: profile._count.strikes,
      botLabeled: !!user?.botLabeledAt,
      lastActiveBucket: lastActiveBucket(user?.lastSeenAt),
      accountStanding: accountStanding({
        isActive: user?.isActive ?? true,
        suspendedUntil: profile.suspendedUntil ?? null,
      }),
    };

    await this.cacheManager.set(cacheKey, profileWithFields, 600000); // 10 minutes
    return profileWithFields;
  }

  // Search profiles by username or full name (case-insensitive).
  // Deactivated accounts are never findable, and Profiles in a block
  // relation with the viewer are hidden in both directions.
  // Param query: Search term
  // Param viewerProfileId: The searching Profile, when authenticated
  // Returns Up to 10 matching profiles
  async searchProfiles(query: string, viewerProfileId?: string) {
    if (!query) return [];

    return this.prisma.profile.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } },
        ],
        user: { deactivatedAt: null },
        AND: [await visibleToViewerWhere(this.prisma, viewerProfileId)],
      },
      take: 10,
      select: {
        id: true,
        username: true,
        fullName: true,
        avatar: true,
        user: {
          select: {
            settings: {
              select: {
                privacyLevel: true,
              },
            },
          },
        },
      },
    });
  }

  // Check whether a username is available and valid.
  // Validates format (3-30 chars, alphanumeric + dots/underscores).
  // Param username: The username to validate
  async checkUsernameAvailability(
    username: string,
  ): Promise<{ available: boolean; message: string }> {
    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9._]{3,30}$/;
    if (!usernameRegex.test(username)) {
      return {
        available: false,
        message:
          'Username must be 3-30 characters and can only contain letters, numbers, dots and underscores',
      };
    }

    // Check if username exists
    const existingProfile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existingProfile) {
      return {
        available: false,
        message: 'This username is already taken',
      };
    }

    return {
      available: true,
      message: 'Username is available',
    };
  }

  // Update the authenticated user's profile. Invalidates the profile cache.
  // Param profileId: The user's ID
  // Param dto: Fields to update
  // Throws NotFoundException if profile not found
  async updateProfile(profileId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw AppException.NotFound(
        ErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
      );
    }

    const { isPrivate, ...profileData } = dto;

    // If isPrivate is provided, update the UserSettings model
    if (isPrivate !== undefined) {
      await this.prisma.user.update({
        where: { id: profile.userId },
        data: {
          settings: {
            upsert: {
              create: {
                privacyLevel: isPrivate
                  ? Visibility.PRIVATE
                  : Visibility.PUBLIC,
              },
              update: {
                privacyLevel: isPrivate
                  ? Visibility.PRIVATE
                  : Visibility.PUBLIC,
              },
            },
          },
        },
      });
    }

    const updateData = {
      ...profileData,
      ...(profileData.accountType
        ? { accountType: profileData.accountType as AccountType }
        : {}),
      ...(profileData.avatar !== undefined
        ? { thumbnailUrl: null, standardUrl: null }
        : {}),
    };

    // Media row created separately (not via a nested `media: { create }`)
    // because mixing a raw FK update (profile.update by id) with a nested
    // relation create isn't a valid Prisma input shape. Wrapped in a
    // transaction with the profile update so a failure partway through
    // can't leave an orphaned Media row.
    const updated = await this.prisma.$transaction(async (tx) => {
      const avatarMedia =
        profileData.avatar !== undefined && profileData.avatar !== null
          ? await tx.media.create({
              data: buildMediaCreateInput({
                type: 'image',
                url: profileData.avatar,
              }),
            })
          : null;

      return tx.profile.update({
        where: { id: profileId },
        data: {
          ...updateData,
          // An explicit null avatar clears the picture, so the Media link
          // must be cleared with it — otherwise avatarMediaId keeps
          // pointing at an image the profile no longer shows. Absent
          // avatar (not part of this update) leaves the existing link
          // untouched.
          ...(avatarMedia
            ? { avatarMediaId: avatarMedia.id }
            : profileData.avatar === null
              ? { avatarMediaId: null }
              : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              createdAt: true,

              settings: {
                select: { privacyLevel: true },
              },
            },
          },
          _count: {
            select: {
              followers: { where: { status: 'ACCEPTED' } },
              following: { where: { status: 'ACCEPTED' } },
            },
          },
        },
      });
    });

    // Flatten for UI convenience
    const flattened = {
      ...updated,
      accountType: updated.accountType,
      verificationLevel: updated.verificationLevel,
      isPrivate: updated.user?.settings?.privacyLevel === 'PRIVATE',
    };

    const embeddingText = this.buildProfileEmbeddingText(updated);
    if (
      dto.username !== undefined ||
      dto.fullName !== undefined ||
      dto.bio !== undefined
    ) {
      await this.enqueueProfileEmbedding(updated.id, embeddingText).catch(
        () => undefined,
      );
    }

    // Invalidate cache
    await this.cacheManager.del(`profile:${profile.username}`);
    return flattened;
  }

  // Referrals belong to the account (invite code lives on User), so this takes a User.id.
  async getMyReferrals(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        inviteCode: true,
        referrals: {
          select: {
            id: true,
            createdAt: true,
            profiles: {
              take: 1,
              select: {
                username: true,
                fullName: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');
    }

    return {
      inviteCode: user.inviteCode,
      maxReferrals: 3,
      referralCount: user.referrals.length,
      referrals: user.referrals.map((r) => ({
        ...r,
        profile: r.profiles[0],
        profiles: undefined,
      })),
    };
  }

  async getMyProfile(profileId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
            lastSeenAt: true,
            isActive: true,
            emailVerified: true,

            inviteCode: true,
            referredById: true,
            identityVerifiedAt: true,
            signupCountry: true,
            botLabeledAt: true,
            settings: {
              select: { isOnboarded: true, privacyLevel: true },
            },
          },
        },
        _count: {
          select: {
            followers: { where: { status: 'ACCEPTED' } },
            following: { where: { status: 'ACCEPTED' } },
            strikes: { where: activeStrikeWhere() },
          },
        },
      },
    });

    if (!profile) {
      throw AppException.NotFound(
        ErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
      );
    }

    // Check if user is verified via subscription
    const isVerifiedResult = await this.prisma.platformSubscription.findFirst({
      where: {
        userId: profile.userId,
        status: SubscriptionStatus.ACTIVE,
        plan: { features: { has: 'verified_badge' } },
      },
      select: { id: true },
    });

    const planVerified =
      !!isVerifiedResult ||
      profile.verificationLevel === 'VERIFIED' ||
      profile.verificationLevel === 'ELITE' ||
      profile.verificationLevel === 'BUSINESS';

    // Flatten for UI convenience
    return {
      ...profile,
      accountType: profile.accountType,
      verificationLevel: profile.verificationLevel,
      inviteCode: profile.user?.inviteCode,
      referredById: profile.user?.referredById,
      identityVerifiedAt: profile.user?.identityVerifiedAt,
      identityVerified: !!profile.user?.identityVerifiedAt,
      emailConfirmed: !!profile.user?.emailVerified,
      emailVerified: profile.user?.emailVerified,
      joinedAt: profile.user?.createdAt,
      signupCountry: profile.user?.signupCountry ?? null,
      strikeCount: profile._count.strikes,
      botLabeled: !!profile.user?.botLabeledAt,
      lastActiveBucket: lastActiveBucket(profile.user?.lastSeenAt),
      accountStanding: accountStanding({
        isActive: profile.user?.isActive ?? true,
        suspendedUntil: profile.suspendedUntil ?? null,
      }),
      isPrivate: profile.user?.settings?.privacyLevel === 'PRIVATE',
      isVerified: planVerified,
    };
  }

  // Deactivate the authenticated user's account (soft, reversible: logging in
  // reactivates it). Acts on the owning User, not the Profile id.
  async deactivateAccount(userId: string, profileId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    const result = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    if (profile) {
      await this.cacheManager.del(`profile:${profile.username}`);
    }
    return result;
  }

  // Schedule account deletion with 30-day grace window (canonical GDPR flow).
  // Delegates to UsersService so BullMQ hard-delete job is always enqueued.
  // Prefer DELETE /users/me from new clients; this keeps DELETE /profiles/me compatible.
  async deleteAccount(userId: string, profileId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    const scheduledDeletionAt =
      await this.usersService.scheduleDeletion(userId);
    if (profile) {
      await this.cacheManager.del(`profile:${profile.username}`);
    }
    return {
      success: true,
      message: 'Account scheduled for deletion',
      scheduled_deletion_at: scheduledDeletionAt.toISOString(),
    };
  }

  // Get all profiles owned by the authenticated User identity.
  async getMyProfiles(userId: string) {
    const profiles = await this.prisma.profile.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        fullName: true,
        bio: true,
        avatar: true,
        thumbnailUrl: true,
        standardUrl: true,
        cover: true,
        website: true,
        location: true,
        verificationLevel: true,
        accountType: true,
        isAccountBanned: true,
        accountBanReason: true,
        suspendedUntil: true,
        createdAt: true,
        _count: {
          select: {
            posts: true,
            followers: { where: { status: 'ACCEPTED' } },
            following: { where: { status: 'ACCEPTED' } },
          },
        },
      },
    });

    return profiles.map((p) => ({
      ...p,
      isSuspended: !!(p.suspendedUntil && p.suspendedUntil > new Date()),
    }));
  }

  // Create an additional profile under the authenticated user identity (max 5 per identity).
  async createProfile(userId: string, dto: CreateProfileDto) {
    const profileCount = await this.prisma.profile.count({
      where: { userId },
    });
    if (profileCount >= 5) {
      throw AppException.BadRequest(
        ErrorCode.INVALID_INPUT,
        'Maximum limit of 5 profiles per user identity reached',
      );
    }

    const availability = await this.checkUsernameAvailability(dto.username);
    if (!availability.available) {
      throw AppException.BadRequest(
        ErrorCode.INVALID_INPUT,
        availability.message,
      );
    }

    const profile = await this.prisma.profile.create({
      data: {
        userId,
        username: dto.username,
        fullName: dto.fullName || null,
        bio: dto.bio || null,
        avatar: dto.avatar || null,
        website: dto.website || null,
        location: dto.location || null,
        accountType: (dto.accountType as AccountType) || 'PERSONAL',
      },
    });

    const embeddingText = this.buildProfileEmbeddingText(profile);
    if (embeddingText) {
      await this.enqueueProfileEmbedding(profile.id, embeddingText);
    }

    return profile;
  }

  // Validate that a profile belongs to the authenticated user and is operational for switching.
  async switchProfile(userId: string, targetProfileId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: targetProfileId },
    });

    if (!profile || profile.userId !== userId) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'Profile not found or does not belong to this account',
      );
    }

    if (profile.isAccountBanned) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        `Target profile is banned: ${profile.accountBanReason || 'violation of community guidelines'}`,
      );
    }

    if (profile.suspendedUntil && profile.suspendedUntil > new Date()) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        `Target profile is suspended until ${profile.suspendedUntil.toISOString()}`,
      );
    }

    return profile;
  }
}
