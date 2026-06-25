/** Trigger re-index */
import { Inject, Injectable } from '@nestjs/common';
import { ContentRating, Visibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';

/**
 * Service for user management: follow suggestions, banning, and unbanning.
 */
@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Get follow suggestions for a user. Excludes already-followed, pending,
   * and blocked users, then ranks by follower count.
   * @param userId - The current user's ID
   * @param limit - Maximum suggestions to return (default 10)
   */
  async getSuggestions(userId: string, limit = 10) {
    // 1. Get IDs of users currently followed by the current user
    const following = await this.prisma.follow.findMany({
      where: {
        followerId: userId,
        status: 'ACCEPTED', // Only exclude accepted follows? Or pending too?
      },
      select: {
        followingId: true,
      },
    });

    const followingIds = following.map((f) => f.followingId);

    // 2. Get IDs of users pending (optional, maybe we suggest them until accepted?)
    // Let's exclude pending too to avoid re-requesting
    const pending = await this.prisma.follow.findMany({
      where: {
        followerId: userId,
        status: 'PENDING',
      },
      select: {
        followingId: true,
      },
    });

    const pendingIds = pending.map((p) => p.followingId);

    // 3. Get IDs of blocked users (both directions)
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: {
        blockerId: true,
        blockedId: true,
      },
    });

    const blockedIds = blocks.flatMap((b) => [b.blockerId, b.blockedId]);

    // 4. Combine all excluded IDs (self + following + pending + blocked)
    const excludedIds = [userId, ...followingIds, ...pendingIds, ...blockedIds];

    // 5. Fetch popular users not in excluded list
    // Improve this later with "Mutual Friends" logic if feasible
    const suggestions = await this.prisma.user.findMany({
      where: {
        id: {
          notIn: excludedIds,
        },
        isActive: true, // Only active users
        profile: {
          isNot: null, // Ensure they have a profile
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

    // Clean up sensitive fields before export
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, refreshTokens, ...safeData } = user;
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

  /**
   * E2EE: Update public and encrypted private key for the user.
   */
  async updateE2EKeys(
    userId: string,
    publicKey: string,
    privateKeyEncrypted: string,
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        e2ePublicKey: publicKey,
        e2ePrivateKeyEncrypted: privateKeyEncrypted,
      },
    });
    return { success: true };
  }

  /**
   * E2EE: Get the public key of a user to encrypt a message for them.
   */
  async getE2EPublicKey(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { e2ePublicKey: true },
    });
    if (!user) {
      throw new Error('User not found');
    }
    return { publicKey: user.e2ePublicKey };
  }

  /**
   * E2EE: Get the user's own keys (public and encrypted private key) for syncing to a new device.
   */
  async getE2EMyKeys(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { e2ePublicKey: true, e2ePrivateKeyEncrypted: true },
    });
    if (!user) {
      throw new Error('User not found');
    }
    return {
      publicKey: user.e2ePublicKey,
      privateKeyEncrypted: user.e2ePrivateKeyEncrypted,
    };
  }
}
