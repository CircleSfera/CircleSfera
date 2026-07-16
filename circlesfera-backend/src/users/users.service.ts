/** Trigger re-index */
import { Inject, Injectable } from '@nestjs/common';
import { ContentRating, Visibility } from '@prisma/client';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';

/**
 * Service for user management: follow suggestions, banning, and unbanning.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
  ) {}

  /**
   * Get follow suggestions for a user. Excludes already-followed, pending,
   * and blocked users, then ranks by follower count.
   * @param userId - The current user's ID
   * @param limit - Maximum suggestions to return (default 10)
   */
  async getSuggestions(userId: string, limit = 10) {
    // 1. Fetch popular users using a single optimized query with relational filters (NOT EXISTS in SQL)
    // This avoids pulling massive arrays into application memory.
    const suggestions = await this.prisma.user.findMany({
      where: {
        id: { not: userId }, // Exclude self
        isActive: true, // Only active users
        profile: { isNot: null }, // Ensure they have a profile
        // Exclude users already followed or with pending requests
        followers: {
          none: { followerId: userId },
        },
        // Exclude users blocking the current user
        blocking: {
          none: { blockedId: userId },
        },
        // Exclude users blocked by the current user
        blockedBy: {
          none: { blockerId: userId },
        },
      },
      take: limit,
      orderBy: {
        followers: {
          _count: 'desc',
        },
      },
      include: {
        profile: {
          select: {
            username: true,
            fullName: true,
            avatar: true,
            bio: true,
          },
        },
        _count: {
          select: {
            followers: true,
          },
        },
      },
    });

    // Remap to cleaner structure
    return suggestions.map((user) => ({
      id: user.id,
      username: user.profile?.username,
      fullName: user.profile?.fullName,
      avatar: user.profile?.avatar,
      bio: user.profile?.bio,
      verificationLevel: user.verificationLevel,
      followersCount: user._count.followers,
      reason:
        user._count.followers > 50 ? 'Popular en CircleSfera' : 'Nuevo Creador',
    }));
  }

  /**
   * Ban (deactivate) a user account. Admin only.
   * @param id - The user ID to ban
   */
  async banUser(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Unban (reactivate) a user account. Admin only.
   * @param id - The user ID to unban
   */
  async unbanUser(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * GDPR: Gathers all user-related data for export.
   * @param userId - The user ID to export
   */
  async exportUserData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        refreshTokens: true,
        posts: {
          include: {
            media: true,
            _count: { select: { likes: true, comments: true } },
          },
        },
        followers: {
          include: {
            follower: {
              select: { profile: { select: { username: true } } },
            },
          },
        },
        following: {
          include: {
            following: {
              select: { profile: { select: { username: true } } },
            },
          },
        },
        comments: true,
        bookmarks: { include: { post: { select: { caption: true } } } },
      },
    });

    if (!user) throw new Error('User not found');

    // Use an explicit allowlist approach for GDPR data export
    // to prevent accidental leakage of sensitive fields (e2e keys, 2FA secrets, etc.)
    const safeData = {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isActive: user.isActive,
      role: user.role,
      verificationLevel: user.verificationLevel,
      accountType: user.accountType,
      profile: user.profile,
      posts: user.posts,
      followers: user.followers,
      following: user.following,
      comments: user.comments,
      bookmarks: user.bookmarks,
    };

    return safeData as Record<string, unknown>;
  }

  /**
   * GDPR: Fully deletes a user and all related data via cascading.
   * @param userId - The user ID to delete
   */
  async deleteUser(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Double check user exists
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      // 2. Perform deletion (Cascading will handle posts, comments, profile, settings, etc.)
      return tx.user.delete({
        where: { id: userId },
      });
    });
  }

  /**
   * Schedule user account for deletion after 30 days.
   * @param userId - The user ID
   * @returns The scheduled deletion date
   */
  async scheduleDeletion(userId: string) {
    const scheduledDeletionAt = new Date();
    scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + 30);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt: scheduledDeletionAt,
      },
    });

    return scheduledDeletionAt;
  }

  /**
   * Get user settings, creating defaults if not exists.
   * @param userId - The user ID
   */
  async getSettings(userId: string) {
    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await this.prisma.userSettings.create({
        data: { userId },
      });
    }

    return settings;
  }

  /**
   * Update user settings.
   * @param userId - The user ID
   * @param dto - Settings update data
   */
  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        privacyLevel: dto.privacyLevel as Visibility,
        contentPreference: dto.contentPreference as ContentRating,
        blurSensitiveContent: dto.blurSensitiveContent,
        emailNotifications: dto.emailNotifications,
        pushNotifications: dto.pushNotifications,
      },
      create: {
        userId,
        privacyLevel: (dto.privacyLevel as Visibility) || Visibility.PUBLIC,
        contentPreference:
          (dto.contentPreference as ContentRating) || ContentRating.GENERAL,
        blurSensitiveContent: dto.blurSensitiveContent ?? true,
        emailNotifications: dto.emailNotifications ?? true,
        pushNotifications: dto.pushNotifications ?? true,
      },
    });
  }

  // --- Identity Verification ---

  async createIdentitySession(
    userId: string,
    returnUrl: string,
  ): Promise<{ url: string }> {
    const session = await this.stripeService.createIdentityVerificationSession(
      userId,
      returnUrl,
    );

    // Save the session ID to the user for tracking
    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeIdentitySessionId: session.id },
    });

    return { url: session.url || returnUrl };
  }

  async handleIdentityWebhook(session: any) {
    const userId = session.metadata?.userId;

    if (userId) {
      const dob = session.verified_outputs?.dob;
      let dateOfBirth: Date | null = null;
      let isActive = true;
      const verificationLevel = 'VERIFIED';

      if (dob?.year && dob?.month && dob?.day) {
        dateOfBirth = new Date(dob.year, dob.month - 1, dob.day);

        // Calculate age
        const today = new Date();
        let age = today.getFullYear() - dateOfBirth.getFullYear();
        const m = today.getMonth() - dateOfBirth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dateOfBirth.getDate())) {
          age--;
        }

        if (age < 16) {
          isActive = false; // Suspend under 16 for GDPR compliance
          console.log(
            `User ${userId} suspended due to being under 16 (Age: ${age})`,
          );
        } else if (age < 18) {
          console.log(`User ${userId} verified but under 18 (Age: ${age})`);
        }
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { verificationLevel: true },
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          identityVerifiedAt: new Date(),
          ...(dateOfBirth && { dateOfBirth }),
          ...(user?.verificationLevel === 'BASIC' && {
            verificationLevel: verificationLevel,
          }),
          isActive: isActive,
        },
      });
      console.log(`Successfully verified identity for user ${userId}`);
    }
  }

  async syncIdentitySession(userId: string): Promise<{ status: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeIdentitySessionId: true, verificationLevel: true, identityVerifiedAt: true },
    });

    if (!user?.stripeIdentitySessionId) {
      return { status: 'no_session' };
    }

    if (user.identityVerifiedAt) {
      return { status: 'already_verified' };
    }

    const session = await this.stripeService.getIdentityVerificationSession(
      user.stripeIdentitySessionId,
    );

    if (session.status === 'verified') {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          identityVerifiedAt: new Date(),
          ...(user.verificationLevel === 'BASIC' && {
            verificationLevel: 'VERIFIED',
          }),
        },
      });
      return { status: 'verified' };
    } else if (session.status === 'canceled') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeIdentitySessionId: null },
      });
      return { status: 'canceled' };
    }

    return { status: session.status };
  }
}
