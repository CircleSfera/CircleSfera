import type { UserSessionTerminateEvent } from '@circlesfera/shared';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminAction, NotificationType, Prisma, Role } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { linkedAccountsWhere } from '../common/abuse/linked-accounts.js';
import { computeTrustScore } from '../common/abuse/trust-score.js';
import { TurnstileService } from '../common/abuse/turnstile.service.js';
import { FIRST_SIGN_IN_ORDER } from '../common/auth/sign-in-lookup.js';
import { EmailService } from '../email/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { activeStrikeWhere } from '../strikes/profile-strikes.constants.js';
import { followTeamPlan } from '../team/team-plan.js';
import { UsersService } from '../users/users.service.js';
import type {
  BroadcastAudienceDto,
  BroadcastEmailDto,
} from './dto/broadcast-email.dto.js';
import type { AdminCreateWhitelistEntryDto } from './dto/create-whitelist-entry.dto.js';
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
  // Set when the account is being deleted (by the person or by staff).
  deletedAt: Date | null;
  createdAt: Date;
  role: string;
  profile: any; // We use any or Prisma.ProfileGetPayload here
  postCount: number;
  identityVerifiedAt: Date | null;
  stripeIdentitySessionId: string | null;
  verificationLevel: VLevel;
  accountType: AType;
  isTestAccount: boolean;
}

// Who a broadcast is sent to: active accounts whose newsletter preference is
// on (an account with no settings row has the default, on).
// The count and the send build it here, so the send goes to exactly who the
// count counted. "With a plan" is a subscription that is active or in trial.
export function broadcastAudienceWhere(
  audience?: BroadcastAudienceDto,
): Prisma.UserWhereInput {
  const withPlan: Prisma.UserWhereInput = {
    platformSubscriptions: {
      some: { status: { in: ['ACTIVE', 'TRIALING'] } },
    },
  };
  return {
    isActive: true,
    OR: [{ settings: { is: null } }, { settings: { newsletter: true } }],
    ...(audience?.locale && { locale: audience.locale }),
    ...(audience?.plan === 'paying' && withPlan),
    ...(audience?.plan === 'free' && { NOT: withPlan }),
  };
}
const BROADCAST_LOG_TARGET = 'NEWSLETTER';

// What a send writes in its audit log entry, and what the list reads back.
export function broadcastLog(
  subject: string,
  sent: number,
  failed: number,
  audience?: BroadcastAudienceDto,
) {
  const who = [audience?.locale, audience?.plan].filter(Boolean).join(', ');
  return `Subject: ${subject} | Success: ${sent} | Failed: ${failed}${who ? ` | Audience: ${who}` : ''}`;
}

/** The subject, the counts and the audience a send wrote in its log entry. */
export function parseBroadcastLog(details: string | null) {
  const found =
    /^Subject: (.*) \| Success: (\d+) \| Failed: (\d+)(?: \| Audience: (.+))?$/s.exec(
      details ?? '',
    );
  if (!found) {
    return { subject: details ?? '', sent: null, failed: null, audience: [] };
  }
  return {
    subject: found[1],
    sent: Number(found[2]),
    failed: Number(found[3]),
    audience: found[4] ? found[4].split(', ') : [],
  };
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
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
  ) {}

  // Log every admin action for accountability.
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

  // Helper to invalidate a profile cache by userId.
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

  // Notification.recipientId is a Profile.id; resolve from account User.id.
  private async resolvePrimaryProfileId(
    userId: string,
  ): Promise<string | null> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  // Paginated users with optional search and status filter. Includes role and post count.
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

    // Identity check: done, started and not finished, or never started.
    if (kycStatus === 'verified') {
      where.identityVerifiedAt = { not: null };
    } else if (kycStatus === 'pending') {
      where.identityVerifiedAt = null;
      where.stripeIdentitySessionId = { not: null };
    } else if (kycStatus === 'not_started') {
      where.identityVerifiedAt = null;
      where.stripeIdentitySessionId = null;
    }

    if (status === 'active') where.isActive = true;
    // Sanctioned: banned, or with a suspension still running, as the list
    // shows them. An account being deleted or off for another reason is not.
    if (status === 'banned') {
      where.OR = [
        { isRootBanned: true },
        { profiles: { some: { suspendedUntil: { gt: new Date() } } } },
      ];
    }

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
          deletedAt: u.deletedAt,
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
          verificationLevel:
            (u.profiles[0]?.verificationLevel as VLevel) || 'BASIC',
          accountType: (u.profiles[0]?.accountType as AType) || 'PERSONAL',
          isTestAccount: u.isTestAccount,
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

  // How many accounts are in each state of the identity check.
  async getKycStats() {
    const [verified, pending, total] = await Promise.all([
      this.prisma.user.count({
        where: { identityVerifiedAt: { not: null } },
      }),
      this.prisma.user.count({
        where: {
          identityVerifiedAt: null,
          stripeIdentitySessionId: { not: null },
        },
      }),
      this.prisma.user.count(),
    ]);
    return { verified, pending, notStarted: total - verified - pending, total };
  }

  async banUser(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profiles: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // The six months to appeal the ban count from now, on every Profile.
    await this.prisma.profile.updateMany({
      where: { userId },
      data: { sanctionedAt: new Date() },
    });
    const result = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, isRootBanned: true },
      include: {
        profiles: {
          select: { id: true, username: true, fullName: true, avatar: true },
        },
      },
    });
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
    const banEvent: UserSessionTerminateEvent['payload'] = {
      userId,
      profileId: result.profiles[0]?.id,
      reason: 'Account banned by administration',
    };
    this.eventEmitter.emit('user.session.terminate', banEvent);
    await this.logAction(adminId, AdminAction.BAN_USER, 'user', userId);
    await this.invalidateProfileCache(userId);

    if (result.email) {
      await this.emailService.sendAccountBannedEmail(
        result.email,
        result.profiles[0]?.fullName || result.profiles[0]?.username,
      );
    }

    return result;
  }

  async unbanUser(adminId: string, userId: string) {
    await this.prisma.profile.updateMany({
      where: { userId },
      data: {
        suspendedUntil: null,
        isAccountBanned: false,
        banStrikeId: null,
        suspensionStrikeId: null,
        suspensionCause: null,
      },
    });
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

  // Staff access is given from Operators, to who may manage operators. The
  // role of an account gives none, so the only change left is back to the
  // plain role, and it never creates, enables or disables an operator.
  async updateUserRole(adminId: string, userId: string, role: string) {
    if (role !== Role.USER) {
      throw new BadRequestException(
        'The role of an account gives no staff access. Add the person in Operators.',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('User not found');

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: Role.USER },
    });
    await this.logAction(
      adminId,
      AdminAction.UPDATE_USER_STATUS,
      'user',
      userId,
      'Role changed to USER',
    );
    await this.invalidateProfileCache(userId);
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
    if (data.verificationLevel || data.accountType) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { profiles: { take: 1 } },
      });
      if (user?.profiles[0]) {
        const updateData: any = {};
        if (data.verificationLevel)
          updateData.verificationLevel = data.verificationLevel;
        if (data.accountType) updateData.accountType = data.accountType;
        await this.prisma.profile.update({
          where: { id: user.profiles[0].id },
          data: updateData,
        });
        // A level or kind set by staff moves the team like a plan change.
        await followTeamPlan(this.prisma, user.profiles[0].id);
      }
    }

    const updateData: Record<string, boolean | undefined> = {
      isActive: data.isActive,
    };

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
      // A staff suspension has no strike behind it.
      data: {
        suspendedUntil: until,
        suspensionStrikeId: null,
        suspensionCause: null,
        sanctionedAt: new Date(),
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
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
    const recipientProfileId = await this.resolvePrimaryProfileId(userId);
    const suspendEvent: UserSessionTerminateEvent['payload'] = {
      userId,
      profileId: recipientProfileId || undefined,
      reason: `Account suspended until ${until.toISOString()}`,
    };
    this.eventEmitter.emit('user.session.terminate', suspendEvent);
    if (recipientProfileId) {
      await this.notificationsService
        .create({
          recipientId: recipientProfileId,
          senderId: await resolveAdminNotificationSenderId(
            this.prisma,
            adminId,
          ),
          type: NotificationType.MODERATION,
          notice: { key: 'account_suspended', until, reason },
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
        suspensionStrikeId: null,
        suspensionCause: null,
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
          notice: { key: 'account_warned', reason },
        })
        .catch((e) => this.logger.error(e));
    }
    return { success: true };
  }

  // The notes the staff left on an account, newest first.
  async getStaffNotes(userId: string) {
    const notes = await this.prisma.staffNote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { displayName: true } },
      },
    });
    return notes.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt,
      author: note.author?.displayName ?? null,
    }));
  }

  // A note is added, never edited or deleted. It changes nothing in the
  // account and is never shown to its holder.
  async addStaffNote(adminId: string, userId: string, body: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const note = await this.prisma.staffNote.create({
      data: { userId, authorId: adminId, body },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { displayName: true } },
      },
    });
    return {
      id: note.id,
      body: note.body,
      createdAt: note.createdAt,
      author: note.author?.displayName ?? null,
    };
  }

  // How many devices the account is signed in on: sessions that can still be
  // renewed.
  async countOpenSessions(userId: string) {
    return {
      open: await this.prisma.refreshToken.count({
        where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
      }),
    };
  }

  // Signs the account out everywhere without sanctioning it: its holder signs
  // in again with their password. The stored sessions are deleted, so none
  // can be renewed, and the open connections of every Profile end at once;
  // a device that is not connected stops when its short access expires.
  async closeUserSessions(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, profiles: { select: { id: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    // What is said to be closed is what the record showed as open; rows of
    // sessions already ended are deleted with them and are not counted.
    const { open: count } = await this.countOpenSessions(userId);
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    for (const profile of user.profiles) {
      const event: UserSessionTerminateEvent['payload'] = {
        userId,
        profileId: profile.id,
        reason: 'Sessions closed by the CircleSfera team',
      };
      this.eventEmitter.emit('user.session.terminate', event);
    }
    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'user',
      userId,
      `Closed ${count} sessions`,
    );
    return { closed: count };
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
            strikes: {
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: {
                id: true,
                kind: true,
                reason: true,
                consequence: true,
                reportId: true,
                createdAt: true,
                expiresAt: true,
                revokedAt: true,
              },
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

    // Warnings and strikes of every Profile of the account, newest first.
    const now = new Date();
    const strikes = user.profiles
      .flatMap((p) =>
        p.strikes.map((strike) => ({
          ...strike,
          profileId: p.id,
          username: p.username,
          status: strike.revokedAt
            ? ('REVOKED' as const)
            : strike.expiresAt > now
              ? ('ACTIVE' as const)
              : ('EXPIRED' as const),
        })),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const { profiles: _profiles, linkedAdminIdentities, ...userRest } = user;

    return {
      ...userRest,
      // Active strikes across the account's Profiles.
      strikeCount: strikes.filter(
        (s) => s.kind === 'STRIKE' && s.status === 'ACTIVE',
      ).length,
      strikes,
      // Every Profile of the person with its own standing: a suspension or
      // a ban applies to one Profile.
      profiles: user.profiles.map((p) => ({
        id: p.id,
        username: p.username,
        fullName: p.fullName,
        isAccountBanned: p.isAccountBanned,
        suspendedUntil:
          p.suspendedUntil && p.suspendedUntil > now ? p.suspendedUntil : null,
        suspensionCause:
          p.suspendedUntil && p.suspendedUntil > now ? p.suspensionCause : null,
      })),
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

  // Accounts sharing device or signup IP hash with this user (hashes never returned).
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

    // No IP or device signal: nothing to compare, so no linked accounts.
    const where = linkedAccountsWhere(user) ?? { id: { in: [] } };
    // The list shows the newest 50; the size of the cluster counts them all.
    const [linked, linkedCount] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          // The account's email counts as verified when its first sign-in's is.
          signIns: {
            orderBy: FIRST_SIGN_IN_ORDER,
            take: 1,
            select: { emailVerified: true },
          },
          identityVerifiedAt: true,
          botLabeledAt: true,
          isActive: true,
          profiles: {
            select: {
              username: true,
              fullName: true,
              avatar: true,
              _count: { select: { strikes: { where: activeStrikeWhere() } } },
            },
          },
        },
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      clusterSize: linkedCount + 1,
      accounts: linked.map((a) => ({
        id: a.id,
        username: a.profiles[0]?.username,
        fullName: a.profiles[0]?.fullName,
        avatar: a.profiles[0]?.avatar,
        createdAt: a.createdAt,
        emailConfirmed: !!a.signIns[0]?.emailVerified,
        identityVerified: !!a.identityVerifiedAt,
        botLabeled: !!a.botLabeledAt,
        // Active strikes across the account's Profiles.
        strikeCount: a.profiles.reduce((sum, p) => sum + p._count.strikes, 0),
        isActive: a.isActive,
      })),
    };
  }

  async getTrustScore(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        // The account's email counts as verified when its first sign-in's is.
        signIns: {
          orderBy: FIRST_SIGN_IN_ORDER,
          take: 1,
          select: { emailVerified: true },
        },
        identityVerifiedAt: true,
        createdAt: true,
        botLabeledAt: true,
        signupIpHash: true,
        profiles: {
          select: {
            _count: { select: { strikes: { where: activeStrikeWhere() } } },
          },
        },
        lastIpHash: true,
        deviceSignals: { select: { visitorHash: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const linked = await this.getLinkedAccounts(userId);
    return computeTrustScore({
      emailVerified: !!user.signIns[0]?.emailVerified,
      identityVerified: !!user.identityVerifiedAt,
      createdAt: user.createdAt,
      strikeCount: user.profiles.reduce((sum, p) => sum + p._count.strikes, 0),
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
          notice: { key: 'bot_labeled' },
          targetType: 'account_bot_label',
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
          signIns: { some: { emailVerified: { not: null } } },
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

  async createWhitelist(adminId: string, data: AdminCreateWhitelistEntryDto) {
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

  // How many people a broadcast reaches: the rule the send itself uses.
  async countBroadcastRecipients(audience?: BroadcastAudienceDto) {
    return {
      count: await this.prisma.user.count({
        where: broadcastAudienceWhere(audience),
      }),
    };
  }

  // The message as written, only to the staff member who is signed in.
  async sendBroadcastTest(adminId: string, dto: BroadcastEmailDto) {
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: adminId },
      select: { email: true },
    });
    if (!admin) throw new NotFoundException('Staff member not found');
    await this.emailService.sendBroadcastEmail(
      admin.email,
      dto.subject,
      dto.title,
      dto.content,
      dto.buttonText,
      dto.buttonUrl,
    );
    return { sentTo: admin.email };
  }

  // The broadcasts sent so far, newest first, read from the audit log entry
  // each send writes.
  async getBroadcastHistory(page: number, limit: number) {
    const where = { targetType: BROADCAST_LOG_TARGET };
    const [rows, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          details: true,
          createdAt: true,
          admin: { select: { displayName: true } },
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        ...parseBroadcastLog(row.details),
        sentBy: row.admin?.displayName ?? null,
        createdAt: row.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  // Resolved OOM vulnerability by processing active users in chunks using keyset (cursor) pagination.
  async sendBroadcastEmail(adminId: string, dto: BroadcastEmailDto) {
    let cursor: string | undefined;
    const batchSize = 100;

    let successfulSent = 0;
    let failedSent = 0;
    let totalRecipients = 0;

    let hasMore = true;

    while (hasMore) {
      const queryArgs: Prisma.UserFindManyArgs = {
        where: broadcastAudienceWhere(dto),
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
              user.id,
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
      BROADCAST_LOG_TARGET,
      'GLOBAL',
      broadcastLog(dto.subject, successfulSent, failedSent, dto),
    );

    return {
      success: true,
      recipients: totalRecipients,
      sent: successfulSent,
      failed: failedSent,
    };
  }
}
