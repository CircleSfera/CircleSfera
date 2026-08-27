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
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

/**
 * Service for profile CRUD, username validation, and account lifecycle (deactivate/delete).
 * Uses cache-manager for profile read caching.
 */
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

  /**
   * Get a public profile by username. Cached for 10 minutes.
   * @param username - The profile username
   * @throws NotFoundException if profile does not exist
   */
  async getProfile(username: string) {
    const cacheKey = `profile:${username}`;
    const cachedProfile = await this.cacheManager.get(cacheKey);
    if (cachedProfile) {
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
            strikeCount: true,
            emailVerified: true,
            identityVerifiedAt: true,
            signupCountry: true,
            botLabeledAt: true,
            verificationLevel: true,
            accountType: true,
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
      profile.user?.verificationLevel === 'VERIFIED' ||
      profile.user?.verificationLevel === 'ELITE' ||
      profile.user?.verificationLevel === 'BUSINESS';

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
      verificationLevel: user?.verificationLevel,
      accountType: user?.accountType,
      privacyLevel: user?.settings?.privacyLevel || Visibility.PUBLIC,
      isPrivate: user?.settings?.privacyLevel === Visibility.PRIVATE,
      isVerified: planVerified,
      identityVerified: !!user?.identityVerifiedAt,
      emailConfirmed: !!user?.emailVerified,
      joinedAt: user?.createdAt?.toISOString?.() ?? user?.createdAt,
      signupCountry: user?.signupCountry ?? null,
      strikeCount: user?.strikeCount ?? 0,
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

  /**
   * Search profiles by username or full name (case-insensitive).
   * @param query - Search term
   * @returns Up to 10 matching profiles
   */
  async searchProfiles(query: string) {
    if (!query) return [];

    return this.prisma.profile.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
      select: {
        id: true,
        username: true,
        fullName: true,
        avatar: true,
        user: {
          select: {
            verificationLevel: true,
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

  /**
   * Check whether a username is available and valid.
   * Validates format (3-30 chars, alphanumeric + dots/underscores).
   * @param username - The username to validate
   */
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

  /**
   * Update the authenticated user's profile. Invalidates the profile cache.
   * @param profileId - The user's ID
   * @param dto - Fields to update
   * @throws NotFoundException if profile not found
   */
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

    const { accountType, isPrivate, ...profileData } = dto;

    // If accountType or isPrivate is provided, update the User and UserSettings models
    if (accountType || isPrivate !== undefined) {
      await this.prisma.user.update({
        where: { id: profile.userId },
        data: {
          ...(accountType ? { accountType: accountType as AccountType } : {}),
          ...(isPrivate !== undefined
            ? {
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
              }
            : {}),
        },
      });
    }

    const updateData = {
      ...profileData,
      ...(profileData.avatar !== undefined
        ? { thumbnailUrl: null, standardUrl: null }
        : {}),
    };

    const updated = await this.prisma.profile.update({
      where: { id: profileId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
            verificationLevel: true,
            accountType: true,
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

    // Flatten for UI convenience
    const flattened = {
      ...updated,
      accountType: updated.user?.accountType,
      verificationLevel: updated.user?.verificationLevel,
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

  /**
   * Get the authenticated user's own profile (not cached).
   * @param profileId - The user's ID
   * @throws NotFoundException if profile not found
   */
  async getMyReferrals(profileId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: profileId },
      select: {
        inviteCode: true,
        referrals: {
          select: {
            id: true,
            createdAt: true,
            profile: {
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
      referrals: user.referrals,
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
            strikeCount: true,
            emailVerified: true,
            verificationLevel: true,
            accountType: true,
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
      profile.user?.verificationLevel === 'VERIFIED' ||
      profile.user?.verificationLevel === 'ELITE' ||
      profile.user?.verificationLevel === 'BUSINESS';

    // Flatten for UI convenience
    return {
      ...profile,
      accountType: profile.user?.accountType,
      verificationLevel: profile.user?.verificationLevel,
      inviteCode: profile.user?.inviteCode,
      referredById: profile.user?.referredById,
      identityVerifiedAt: profile.user?.identityVerifiedAt,
      identityVerified: !!profile.user?.identityVerifiedAt,
      emailConfirmed: !!profile.user?.emailVerified,
      emailVerified: profile.user?.emailVerified,
      joinedAt: profile.user?.createdAt,
      signupCountry: profile.user?.signupCountry ?? null,
      strikeCount: profile.user?.strikeCount ?? 0,
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

  /**
   * Deactivate the authenticated user's account (soft, reversible).
   * @param profileId - The user's ID
   */
  async deactivateAccount(profileId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    const result = await this.prisma.user.update({
      where: { id: profileId },
      data: { isActive: false },
    });
    if (profile) {
      await this.cacheManager.del(`profile:${profile.username}`);
    }
    return result;
  }

  /**
   * Schedule account deletion with 30-day grace window (canonical GDPR flow).
   * Delegates to UsersService so BullMQ hard-delete job is always enqueued.
   * Prefer DELETE /users/me from new clients; this keeps DELETE /profiles/me compatible.
   */
  async deleteAccount(profileId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    const scheduledDeletionAt =
      await this.usersService.scheduleDeletion(profileId);
    if (profile) {
      await this.cacheManager.del(`profile:${profile.username}`);
    }
    return {
      success: true,
      message: 'Account scheduled for deletion',
      scheduled_deletion_at: scheduledDeletionAt.toISOString(),
    };
  }
}
