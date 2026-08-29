import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdminAction, NotificationType, Prisma, Role } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { computeTrustScore } from '../common/abuse/trust-score.js';
import { TurnstileService } from '../common/abuse/turnstile.service.js';
import { EmailService } from '../email/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import type { BroadcastEmailDto } from './dto/broadcast-email.dto.js';
import type { CreateWhitelistEntryDto } from './dto/create-whitelist-entry.dto.js';
import type { UpdateWhitelistEntryDto } from './dto/update-whitelist-entry.dto.js';
import { resolveAdminNotificationSenderId } from './utils/resolve-admin-notification-sender.js';
import { userListRoleWhere } from './utils/user-list-role-filter.js';

type VLevel = 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
type AType = 'PERSONAL' | 'CREATOR' | 'BUSINESS';

export interface UserWithVerification {
  id: string;
  email: string;
  isActive: boolean;
  isRootBanned: boolean;
  suspendedUntil: Date | null;
  createdAt: Date;
  role: string;
  profile: any; // We use any or Prisma.ProfileGetPayload here
  postCount: number;
  identityVerifiedAt: Date | null;
  stripeIdentitySessionId: string | null;
  verificationLevel: VLevel;
  accountType: AType;
}

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
  ) {}

  /** Log every admin action for accountability. */
  async logAction(
    adminId: string,
    action: AdminAction,
    targetType: string,
    targetId: string,
    details?: string,
    meta?: { ipAddress?: string; userAgent?: string; requestId?: string },
  ) {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        details,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        requestId: meta?.requestId,
      },
    });
  }

  /** Helper to invalidate a profile cache by userId. */
  private async invalidateProfileCache(userId: string) {
    try {
      const profiles = await this.prisma.profile.findMany({
        where: { userId },
        select: { username: true },
      });
      for (const profile of profiles) {
        if (profile.username) {
          await this.cacheManager.del(`profile:${profile.username}`);
        }
      }
    } catch (error) {
      console.error('Failed to invalidate cache:', error);
    }
  }

  /** Notification.recipientId is a Profile.id; resolve from account User.id. */
  private async resolvePrimaryProfileId(
    userId: string,
  ): Promise<string | null> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  /** Paginated users with optional search and status filter. Includes role and post count. */
  async getUsers(
    page = 1,
    limit = 10,
    search?: string,
    status?: string,
    role?: string,
    kycStatus?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              {
                profiles: {
                  some: {
                    username: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              },
              {
                profiles: {
                  some: {
                    fullName: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const roleWhere = userListRoleWhere(role);
    if (roleWhere) {
      const existingAnd = where.AND
        ? Array.isArray(where.AND)
          ? where.AND
          : [where.AND]
        : [];
      where.AND = [...existingAnd, roleWhere];
    }

    if (kycStatus) {
      if (kycStatus === 'APPROVED') {
        where.identityVerifiedAt = { not: null };
      } else if (kycStatus === 'PENDING') {
        where.identityVerifiedAt = null;
        where.stripeIdentitySessionId = { not: null };
      }
    }

    if (status === 'active') where.isActive = true;
    if (status === 'banned') where.isActive = false;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          profiles: { include: { _count: { select: { posts: true } } } },
          linkedAdminIdentities: { where: { status: 'ACTIVE' } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map(
        (u): UserWithVerification => ({
          id: u.id,
          email: u.email,
          isActive: u.isActive,
          isRootBanned: u.isRootBanned,
          suspendedUntil: u.profiles[0]?.suspendedUntil || null,
          createdAt: u.createdAt,
          role:
            u.linkedAdminIdentities && u.linkedAdminIdentities.length > 0
              ? 'ADMIN'
              : u.role,
          profile: u.profiles[0],
          postCount: u.profiles.reduce(
            (acc, p) => acc + (p._count?.posts || 0),
            0,
          ),
          identityVerifiedAt: u.identityVerifiedAt,
          stripeIdentitySessionId: u.stripeIdentitySessionId,
          verificationLevel: (u.verificationLevel as VLevel) || 'BASIC',
          accountType: (u.accountType as AType) || 'PERSONAL',
        }),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getKycStats() {
    const approved = await this.prisma.user.count({
      where: { identityVerifiedAt: { not: null } },
    });
    const pending = await this.prisma.user.count({
      where: {
        identityVerifiedAt: null,
        stripeIdentitySessionId: { not: null },
      },
    });
    const rejected = 0;
    return { pending, approved, rejected };
  }

  async banUser(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profiles: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const result = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, isRootBanned: true },
      include: {
        profiles: {
          select: { username: true, fullName: true, avatar: true },
        },
      },
    });
    await this.logAction(adminId, AdminAction.BAN_USER, 'user', userId);
    await this.invalidateProfileCache(userId);

    if (result.email) {
      await this.emailService.sendModerationEmail(
        result.email,
        result.profiles[0]?.fullName ||
          result.profiles[0]?.username ||
          'Usuario',
        'suspendida',
        'Cuenta',
        'Violación de los Términos de Servicio',
      );
    }

    return result;
  }

  async unbanUser(adminId: string, userId: string) {
    const result = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true, isRootBanned: false },
      include: {
        profiles: true,
      },
    });
    await this.logAction(adminId, AdminAction.UNBAN_USER, 'user', userId);
    await this.invalidateProfileCache(userId);
    return result;
  }

  /**
   * @deprecated Platform User.role no longer grants Admin Panel access.
   * Creates/activates a linked AdminIdentity with SUPER_ADMIN.
   */
  async promoteUser(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.prisma.adminIdentity.findUnique({
      where: { email: user.email },
    });

    let identityId: string;
    if (existing) {
      await this.prisma.adminIdentity.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          linkedUserId: user.id,
        },
      });
      await this.prisma.adminIdentityRole.upsert({
        where: {
          adminId_roleId: { adminId: existing.id, roleId: 'arole_super' },
        },
        create: { adminId: existing.id, roleId: 'arole_super' },
        update: {},
      });
      identityId = existing.id;
    } else {
      const created = await this.prisma.adminIdentity.create({
        data: {
          email: user.email,
          passwordHash: '$2b$10$AdminPanel.ResetRequired.placeholderXXXXX',
          displayName: user.email.split('@')[0],
          status: 'ACTIVE',
          mfaRequired: true,
          linkedUserId: user.id,
          roles: { create: [{ roleId: 'arole_super' }] },
        },
      });
      identityId = created.id;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'USER' },
    });

    await this.logAction(
      adminId,
      AdminAction.ADMIN_IDENTITY_CREATED,
      'admin',
      identityId,
      `Linked from platform user ${userId}; password must be set via bootstrap-admin`,
    );
    await this.invalidateProfileCache(userId);
    return { adminIdentityId: identityId, email: user.email };
  }

  /** Disables linked AdminIdentity for a platform user. */
  async demoteUser(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const identity = await this.prisma.adminIdentity.findFirst({
      where: { OR: [{ linkedUserId: userId }, { email: user.email }] },
    });

    if (identity) {
      await this.prisma.adminIdentity.update({
        where: { id: identity.id },
        data: { status: 'DISABLED' },
      });
      await this.prisma.adminRefreshToken.deleteMany({
        where: { adminId: identity.id },
      });
      await this.logAction(
        adminId,
        AdminAction.ADMIN_IDENTITY_DISABLED,
        'admin',
        identity.id,
      );
    }

    const result = await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'USER' },
    });
    await this.logAction(adminId, AdminAction.DEMOTE_USER, 'user', userId);
    await this.invalidateProfileCache(userId);
    return result;
  }

  async updateUserRole(adminId: string, userId: string, role: string) {
    if (['ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE'].includes(role)) {
      if (role === 'ADMIN') {
        const targetUser = await this.prisma.user.findUnique({
          where: { id: userId },
        });
        if (!targetUser) throw new NotFoundException('User not found');

        const existing = await this.prisma.adminIdentity.findUnique({
          where: { email: targetUser.email },
        });
        if (existing) {
          if (existing.status !== 'ACTIVE') {
            await this.prisma.adminIdentity.update({
              where: { id: existing.id },
              data: { status: 'ACTIVE' },
            });
            await this.logAction(
              adminId,
              AdminAction.ADMIN_IDENTITY_CREATED,
              'admin',
              existing.id,
              'Re-activated AdminIdentity via user promotion',
            );
            return targetUser;
          }
          throw new BadRequestException(
            'This user already has an AdminIdentity operator account',
          );
        }

        const superAdminRole = await this.prisma.adminRole.findUnique({
          where: { name: 'SUPER_ADMIN' },
        });
        if (!superAdminRole) {
          throw new BadRequestException(
            'SUPER_ADMIN role not found in database',
          );
        }

        const crypto = await import('node:crypto');
        const argon2 = await import('argon2');
        const password = crypto.randomBytes(16).toString('hex');
        const passwordHash = await argon2.hash(password);

        await this.prisma.adminIdentity.create({
          data: {
            email: targetUser.email,
            passwordHash,
            displayName: targetUser.email.split('@')[0],
            status: 'ACTIVE',
            mfaRequired: true,
            linkedUserId: targetUser.id,
            roles: {
              create: { roleId: superAdminRole.id },
            },
          },
        });

        await this.logAction(
          adminId,
          AdminAction.ADMIN_IDENTITY_CREATED,
          'admin',
          targetUser.id,
          `Promoted user ${targetUser.email} to AdminIdentity operator`,
        );

        return targetUser;
      }
      throw new BadRequestException(
        'Staff roles on User are deprecated. Use AdminIdentity / bootstrap-admin.',
      );
    }
    if (role === 'USER') {
      const existingIdentities = await this.prisma.adminIdentity.findMany({
        where: { linkedUserId: userId, status: 'ACTIVE' },
      });
      if (existingIdentities.length > 0) {
        await this.prisma.adminIdentity.updateMany({
          where: { linkedUserId: userId },
          data: { status: 'DISABLED' },
        });
        for (const identity of existingIdentities) {
          await this.logAction(
            adminId,
            AdminAction.ADMIN_IDENTITY_DISABLED,
            'admin',
            identity.id,
            `Demoted user and disabled their AdminIdentity`,
          );
        }
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: role as any },
    });
    await this.logAction(
      adminId,
      AdminAction.UPDATE_USER_STATUS,
      'user',
      userId,
      `Role changed to ${role}`,
    );
    return user;
  }

  async updateUserStatus(
    adminId: string,
    userId: string,
    data: {
      verificationLevel?: string;
      accountType?: string;
      isActive?: boolean;
    },
  ) {
    const updateData: Record<string, string | boolean | undefined> = {
      isActive: data.isActive,
    };

    if (data.verificationLevel) {
      updateData.verificationLevel = data.verificationLevel;
    }
    if (data.accountType) {
      updateData.accountType = data.accountType;
    }

    const result = await this.prisma.user.update({
      where: { id: userId },
      data: updateData as unknown as Prisma.UserUpdateInput,
    });
    await this.logAction(
      adminId,
      AdminAction.UPDATE_USER_STATUS,
      'user',
      userId,
      `Nivel: ${data.verificationLevel || 'n/a'}, Tipo: ${
        data.accountType || 'n/a'
      }`,
    );
    await this.invalidateProfileCache(userId);
    return result;
  }

  async revokeUserKYC(adminId: string, userId: string) {
    const result = await this.prisma.user.update({
      where: { id: userId },
      data: {
        identityVerifiedAt: null,
        stripeIdentitySessionId: null,
      },
    });
    await this.usersService.syncUserTier(userId);
    await this.logAction(
      adminId,
      AdminAction.UPDATE_USER_STATUS,
      'user',
      userId,
      'Revoked KYC Verification',
    );
    await this.invalidateProfileCache(userId);
    return result;
  }

  async syncUserKYC(adminId: string, userId: string) {
    const result = await this.usersService.syncIdentitySession(userId);
    await this.logAction(
      adminId,
      AdminAction.UPDATE_USER_STATUS,
      'user',
      userId,
      `Synced KYC from Stripe: ${result.status}`,
    );
    await this.invalidateProfileCache(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        identityVerifiedAt: true,
        stripeIdentitySessionId: true,
        verificationLevel: true,
      },
    });
    return { ...result, user };
  }

  async deleteUser(adminId: string, userId: string) {
    await this.logAction(
      adminId,
      AdminAction.DELETE_USER,
      'user',
      userId,
      'Full account deletion',
    );
    return this.prisma.user.delete({ where: { id: userId } });
  }

  async suspendUser(
    adminId: string,
    userId: string,
    days: number,
    reason?: string,
  ) {
    const until = new Date();
    until.setDate(until.getDate() + Math.max(1, days));
    await this.prisma.profile.updateMany({
      where: { userId },
      data: {
        suspendedUntil: until,
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
      },
    });
    await this.logAction(
      adminId,
      AdminAction.ACCOUNT_SUSPENDED,
      'user',
      userId,
      `Suspended until ${until.toISOString()}: ${reason || ''}`,
    );
    const recipientProfileId = await this.resolvePrimaryProfileId(userId);
    if (recipientProfileId) {
      await this.notificationsService
        .create({
          recipientId: recipientProfileId,
          senderId: await resolveAdminNotificationSenderId(
            this.prisma,
            adminId,
          ),
          type: NotificationType.MODERATION,
          content:
            `Your account is suspended until ${until.toISOString().slice(0, 10)}. ${reason || ''}`.trim(),
        })
        .catch((e) => this.logger.error(e));
    }
    return { success: true, suspendedUntil: until };
  }

  async restoreUser(adminId: string, userId: string) {
    await this.prisma.profile.updateMany({
      where: { userId },
      data: {
        suspendedUntil: null,
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
      },
    });
    await this.logAction(adminId, AdminAction.ACCOUNT_RESTORED, 'user', userId);
    return { success: true };
  }

  async warnUser(adminId: string, userId: string, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.logAction(
      adminId,
      AdminAction.ACCOUNT_WARNED,
      'user',
      userId,
      reason || 'Formal warning',
    );
    const recipientProfileId = await this.resolvePrimaryProfileId(userId);
    if (recipientProfileId) {
      await this.notificationsService
        .create({
          recipientId: recipientProfileId,
          senderId: await resolveAdminNotificationSenderId(
            this.prisma,
            adminId,
          ),
          type: NotificationType.MODERATION,
          content:
            reason ||
            'You received a formal warning for violating CircleSfera policies.',
        })
        .catch((e) => this.logger.error(e));
    }
    return { success: true };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profiles: {
          include: {
            posts: {
              orderBy: { createdAt: 'desc' },
              take: 3,
              select: { id: true, caption: true, createdAt: true, type: true },
            },
            _count: {
              select: {
                posts: true,
                comments: true,
                stories: true,
                liveStreams: true,
                followers: true,
                following: true,
              },
            },
          },
        },
        linkedAdminIdentities: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
    });

    const [reportsAgainst, reportsAgainstCount] = await Promise.all([
      this.prisma.report.findMany({
        where: { targetType: 'USER', targetId: userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, reason: true, status: true, createdAt: true },
      }),
      this.prisma.report.count({
        where: { targetType: 'USER', targetId: userId },
      }),
    ]);

    const primaryProfile = user.profiles[0] ?? null;
    const recentPosts = user.profiles
      .flatMap((p) => p.posts)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 3);

    const { profiles: _profiles, linkedAdminIdentities, ...userRest } = user;

    return {
      ...userRest,
      role: linkedAdminIdentities.length > 0 ? Role.ADMIN : user.role,
      profile: primaryProfile
        ? {
            username: primaryProfile.username,
            fullName: primaryProfile.fullName,
            avatar: primaryProfile.avatar,
            standardUrl: primaryProfile.standardUrl,
            thumbnailUrl: primaryProfile.thumbnailUrl,
            bio: primaryProfile.bio,
          }
        : null,
      posts: recentPosts,
      reports: reportsAgainst,
      _count: {
        posts: user.profiles.reduce(
          (acc, p) => acc + (p._count?.posts || 0),
          0,
        ),
        comments: user.profiles.reduce(
          (acc, p) => acc + (p._count?.comments || 0),
          0,
        ),
        stories: user.profiles.reduce(
          (acc, p) => acc + (p._count?.stories || 0),
          0,
        ),
        liveStreams: user.profiles.reduce(
          (acc, p) => acc + (p._count?.liveStreams || 0),
          0,
        ),
        followers: user.profiles.reduce(
          (acc, p) => acc + (p._count?.followers || 0),
          0,
        ),
        following: user.profiles.reduce(
          (acc, p) => acc + (p._count?.following || 0),
          0,
        ),
        reportsAgainst: reportsAgainstCount,
      },
    };
  }

  /** Accounts sharing device or signup IP hash with this user (hashes never returned). */
  async getLinkedAccounts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        signupIpHash: true,
        lastIpHash: true,
        deviceSignals: { select: { visitorHash: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const visitorHashes = user.deviceSignals.map((d) => d.visitorHash);
    const ipHashes = [user.signupIpHash, user.lastIpHash].filter(
      (h): h is string => !!h,
    );

    const linked = await this.prisma.user.findMany({
      where: {
        id: { not: userId },
        OR: [
          ...(ipHashes.length
            ? [
                { signupIpHash: { in: ipHashes } },
                { lastIpHash: { in: ipHashes } },
              ]
            : []),
          ...(visitorHashes.length
            ? [
                {
                  deviceSignals: {
                    some: { visitorHash: { in: visitorHashes } },
                  },
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        createdAt: true,
        emailVerified: true,
        identityVerifiedAt: true,
        botLabeledAt: true,
        strikeCount: true,
        isActive: true,
        profiles: { select: { username: true, fullName: true, avatar: true } },
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    return {
      clusterSize: linked.length + 1,
      accounts: linked.map((a) => ({
        id: a.id,
        username: a.profiles[0]?.username,
        fullName: a.profiles[0]?.fullName,
        avatar: a.profiles[0]?.avatar,
        createdAt: a.createdAt,
        emailConfirmed: !!a.emailVerified,
        identityVerified: !!a.identityVerifiedAt,
        botLabeled: !!a.botLabeledAt,
        strikeCount: a.strikeCount,
        isActive: a.isActive,
      })),
    };
  }

  async getTrustScore(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerified: true,
        identityVerifiedAt: true,
        createdAt: true,
        strikeCount: true,
        botLabeledAt: true,
        signupIpHash: true,
        lastIpHash: true,
        deviceSignals: { select: { visitorHash: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const linked = await this.getLinkedAccounts(userId);
    return computeTrustScore({
      emailVerified: !!user.emailVerified,
      identityVerified: !!user.identityVerifiedAt,
      createdAt: user.createdAt,
      strikeCount: user.strikeCount,
      botLabeled: !!user.botLabeledAt,
      clusterSize: linked.clusterSize,
    });
  }

  async applyBotLabel(adminId: string, userId: string, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        botLabeledAt: new Date(),
        botLabelReason: reason.trim().slice(0, 500),
      },
    });
    await this.logAction(
      adminId,
      AdminAction.ACCOUNT_BOT_LABELED,
      'user',
      userId,
      reason.trim().slice(0, 500),
    );
    const recipientProfileId = await this.resolvePrimaryProfileId(userId);
    if (recipientProfileId) {
      await this.notificationsService
        .create({
          recipientId: recipientProfileId,
          senderId: await resolveAdminNotificationSenderId(
            this.prisma,
            adminId,
          ),
          type: NotificationType.MODERATION,
          content:
            'Your account was labeled as possibly automated after a staff review. You can appeal in Settings.',
        })
        .catch((e) => this.logger.error(e));
    }
    await this.invalidateProfileCache(userId);
    return { success: true };
  }

  async clearBotLabel(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: { botLabeledAt: null, botLabelReason: null },
    });
    await this.logAction(
      adminId,
      AdminAction.ACCOUNT_BOT_LABEL_CLEARED,
      'user',
      userId,
      'Cleared bot label',
    );
    await this.invalidateProfileCache(userId);
    return { success: true };
  }

  async getSignupFunnelStats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [signups24h, verified24h, counters] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      this.prisma.user.count({
        where: {
          createdAt: { gte: since },
          emailVerified: { not: null },
        },
      }),
      this.turnstile.getFunnelCounters(),
    ]);
    return {
      signups24h,
      emailVerifiedAmongSignups24h: verified24h,
      emailVerifiedRate24h:
        signups24h === 0 ? 0 : Math.round((verified24h / signups24h) * 100),
      turnstileFailures: counters.turnstileFailures,
      emailForbidden: counters.emailForbidden,
    };
  }

  async getWhitelist(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.WhitelistEntryWhereInput = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [entries, total] = await Promise.all([
      this.prisma.whitelistEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.whitelistEntry.count({ where }),
    ]);

    return {
      data: entries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createWhitelist(adminId: string, data: CreateWhitelistEntryDto) {
    const existing = await this.prisma.whitelistEntry.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (existing) {
      throw new BadRequestException('Email already on whitelist');
    }
    const result = await this.prisma.whitelistEntry.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
      },
    });
    await this.logAction(
      adminId,
      AdminAction.UPDATE_WHITELIST,
      'whitelist',
      result.id,
      `Created: ${result.email}`,
    );
    return result;
  }

  async updateWhitelist(
    adminId: string,
    id: string,
    data: UpdateWhitelistEntryDto,
  ) {
    const result = await this.prisma.whitelistEntry.update({
      where: { id },
      data: data as Prisma.WhitelistEntryUpdateInput,
    });
    await this.logAction(
      adminId,
      AdminAction.UPDATE_WHITELIST,
      'whitelist',
      id,
      JSON.stringify(data),
    );
    return result;
  }

  async deleteWhitelist(adminId: string, id: string) {
    await this.logAction(
      adminId,
      AdminAction.DELETE_WHITELIST,
      'whitelist',
      id,
    );
    return this.prisma.whitelistEntry.delete({ where: { id } });
  }

  async exportUsersCSV() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        profiles: {
          include: {
            _count: { select: { posts: true } },
          },
        },
      },
    });

    const header = 'ID,Username,Email,Full Name,Role,Status,Posts,Joined';
    const rows = users.map((u) =>
      [
        u.id,
        u.profiles[0]?.username || '',
        u.email,
        `"${(u.profiles[0]?.fullName || '').replace(/"/g, '""')}"`,
        u.role,
        u.isActive ? 'Active' : 'Banned',
        u.profiles.reduce((acc, p) => acc + (p._count?.posts || 0), 0),
        u.createdAt.toISOString(),
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }

  /**
   * Resolved OOM vulnerability by processing active users in chunks using keyset (cursor) pagination.
   */
  async sendBroadcastEmail(adminId: string, dto: BroadcastEmailDto) {
    let cursor: string | undefined;
    const batchSize = 100;

    let successfulSent = 0;
    let failedSent = 0;
    let totalRecipients = 0;

    let hasMore = true;

    while (hasMore) {
      const queryArgs: Prisma.UserFindManyArgs = {
        where: { isActive: true },
        select: { email: true, id: true },
        take: batchSize,
        skip: cursor ? 1 : 0,
        orderBy: { id: 'asc' },
      };
      if (cursor) {
        queryArgs.cursor = { id: cursor };
      }

      const activeUsers = (await this.prisma.user.findMany(queryArgs)) as {
        email: string;
        id: string;
      }[];

      if (activeUsers.length === 0) {
        hasMore = false;
        break;
      }

      totalRecipients += activeUsers.length;
      cursor = activeUsers[activeUsers.length - 1].id;

      // Brevo sending within batch
      const innerBatchSize = 25;
      for (let i = 0; i < activeUsers.length; i += innerBatchSize) {
        const batch = activeUsers.slice(i, i + innerBatchSize);

        const results = await Promise.allSettled(
          batch.map((user) =>
            this.emailService.sendBroadcastEmail(
              user.email,
              dto.subject,
              dto.title,
              dto.content,
              dto.buttonText,
              dto.buttonUrl,
            ),
          ),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            successfulSent++;
          } else {
            failedSent++;
          }
        }
      }
    }

    await this.logAction(
      adminId,
      AdminAction.UPDATE_WHITELIST,
      'NEWSLETTER',
      'GLOBAL',
      `Subject: ${dto.subject} | Success: ${successfulSent} | Failed: ${failedSent}`,
    );

    return {
      success: true,
      recipients: totalRecipients,
      sent: successfulSent,
      failed: failedSent,
    };
  }
}
