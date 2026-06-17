import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AccountType,
  SubscriptionStatus,
  Visibility,
} from '@prisma/client';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service.js';
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
  ) {}

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

    const profile = await this.prisma.profile.findUnique({
      where: { username },
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
              select: {
                privacyLevel: true,
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
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    // Check if user is verified via subscription
    const isVerifiedResult = await this.prisma.platformSubscription.findFirst({
      where: {
        userId: profile.userId,
        status: SubscriptionStatus.ACTIVE,
        plan: { name: { contains: 'Verified', mode: 'insensitive' } },
      },
      select: { id: true },
    });

    // Explicitly add fields to the top level for frontend simplicity
    const profileWithFields = {
      ...profile,
      verificationLevel: profile.user?.verificationLevel,
      accountType: profile.user?.accountType,
      privacyLevel: profile.user?.settings?.privacyLevel || Visibility.PUBLIC,
      isPrivate: profile.user?.settings?.privacyLevel === Visibility.PRIVATE, // Legacy field support for frontend
      isVerified:
        !!isVerifiedResult ||
        profile.user?.verificationLevel === 'VERIFIED' ||
        profile.user?.verificationLevel === 'ELITE' ||
        profile.user?.verificationLevel === 'BUSINESS',
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
        userId: true,
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
    const existingProfile = await this.prisma.profile.findUnique({
      where: { username },
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
   * @param userId - The user's ID
   * @param dto - Fields to update
   * @throws NotFoundException if profile not found
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const { accountType, isPrivate, ...profileData } = dto;

    // If accountType or isPrivate is provided, update the User and UserSettings models
    if (accountType || isPrivate !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
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
      where: { userId },
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
            _count: {
              select: {
                followers: { where: { status: 'ACCEPTED' } },
                following: { where: { status: 'ACCEPTED' } },
              },
            },
          },
        },
      },
    });

    // Flatten for UI convenience
    const flattened = {
      ...updated,
      accountType: updated.user?.accountType,
      verificationLevel: updated.user?.verificationLevel,
    };

    // Invalidate cache
    await this.cacheManager.del(`profile:${profile.username}`);
    return flattened;
  }

  /**
   * Get the authenticated user's own profile (not cached).
   * @param userId - The user's ID
   * @throws NotFoundException if profile not found
   */
  async getMyProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
            verificationLevel: true,
            accountType: true,
            inviteCode: true,
            referredById: true,
            _count: {
              select: {
                followers: { where: { status: 'ACCEPTED' } },
                following: { where: { status: 'ACCEPTED' } },
              },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    // Check if user is verified via subscription
    const isVerifiedResult = await this.prisma.platformSubscription.findFirst({
      where: {
        userId: profile.userId,
        status: SubscriptionStatus.ACTIVE,
        plan: { name: { contains: 'Verified', mode: 'insensitive' } },
      },
      select: { id: true },
    });

    // Flatten for UI convenience
    return {
      ...profile,
      accountType: profile.user?.accountType,
      verificationLevel: profile.user?.verificationLevel,
      inviteCode: profile.user?.inviteCode,
      referredById: profile.user?.referredById,
      isVerified:
        !!isVerifiedResult ||
        profile.user?.verificationLevel === 'VERIFIED' ||
        profile.user?.verificationLevel === 'ELITE' ||
        profile.user?.verificationLevel === 'BUSINESS',
    };
  }

  /**
   * Deactivate the authenticated user's account (soft, reversible).
   * @param userId - The user's ID
   */
  async deactivateAccount(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    const result = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
    if (profile) {
      await this.cacheManager.del(`profile:${profile.username}`);
    }
    return result;
  }

  /**
   * Mark the authenticated user's account as deleted (soft delete with timestamp).
   * @param userId - The user's ID
   */
  async deleteAccount(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    // Soft delete
    const result = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });
    if (profile) {
      await this.cacheManager.del(`profile:${profile.username}`);
    }
    return result;
  }
}
