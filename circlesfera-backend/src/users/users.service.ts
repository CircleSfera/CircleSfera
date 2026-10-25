import type { UserSessionTerminateEvent } from '@circlesfera/shared';
import { InjectQueue } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AdminAction,
  ContentRating,
  type Locale,
  type Prisma,
  SubscriptionStatus,
  VerificationLevel,
  Visibility,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import type { Cache } from 'cache-manager';
import type Stripe from 'stripe';
import { QUEUE_NAMES } from '../common/constants/queue-policy.constants.js';
import { setProfilePrivacy } from '../common/policies/profile-privacy.policy.js';
import { CryptoService } from '../common/services/crypto.service.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { EmailService } from '../email/email.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { followTeamPlan } from '../team/team-plan.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';

// The push switches of a Profile: the pause and the five groups.
const PROFILE_PUSH_FIELDS = [
  'pushNotifications',
  'pushLikes',
  'pushComments',
  'pushFollows',
  'pushMessages',
  'pushLive',
] as const;

const PROFILE_PUSH_SELECT = Object.fromEntries(
  PROFILE_PUSH_FIELDS.map((f) => [f, true]),
) as Record<(typeof PROFILE_PUSH_FIELDS)[number], true>;

// Service for user management: follow suggestions, banning, and unbanning.
// Files of an erased account deleted by one job.
const ERASE_FILES_PER_JOB = 500;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
    @InjectQueue('users-processing') private readonly usersQueue: Queue,
    @Inject(OutboxService) private readonly outboxService: OutboxService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}

  // Get follow suggestions for a user. Excludes already-followed, pending,
  // And blocked users, then ranks by follower count.
  // Param userId: The current user's ID
  // Param limit: Maximum suggestions to return (default 10)
  async getSuggestions(userId: string, limit = 10) {
    // 1. Fetch popular profiles using a single optimized query with relational filters (NOT EXISTS in SQL)
    // We get profiles, excluding the current user's profiles
    const userProfiles = await this.prisma.profile.findMany({
      where: { userId },
      select: { id: true },
    });
    const profileIds = userProfiles.map((p) => p.id);

    const suggestions = await this.prisma.profile.findMany({
      where: {
        userId: { not: userId }, // Exclude self
        user: { isActive: true }, // Only active users
        // Exclude profiles already followed or with pending requests by any of the user's profiles
        followers: {
          none: { followerId: { in: profileIds } },
        },
        // Never suggest a Profile in a block relation, either way.
        blocking: { none: { blockedId: { in: profileIds } } },
        blockedBy: { none: { blockerId: { in: profileIds } } },
      },
      take: limit,
      orderBy: {
        followers: {
          _count: 'desc',
        },
      },
      include: {
        user: {
          select: { id: true },
        },
        _count: {
          select: {
            followers: true,
          },
        },
      },
    });

    // Remap to cleaner structure
    return suggestions.map((profile) => ({
      id: profile.id,
      profileId: profile.id,
      username: profile.username,
      fullName: profile.fullName,
      avatar: profile.avatar,
      bio: profile.bio,
      verificationLevel: profile.verificationLevel,
      followersCount: profile._count.followers,
      reason:
        profile._count.followers > 50
          ? 'Popular en CircleSfera'
          : 'Nuevo Creador',
    }));
  }

  // Ban (deactivate) a user account. Admin only.
  // Param id: The user ID to ban
  async banUser(id: string) {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false, isRootBanned: true },
    });
    await this.prisma.refreshToken.deleteMany({
      where: { userId: id },
    });
    const banEvent: UserSessionTerminateEvent['payload'] = {
      userId: id,
      reason: 'Account banned by administration',
    };
    this.eventEmitter.emit('user.session.terminate', banEvent);
    return updated;
  }

  // Unban (reactivate) a user account. Admin only.
  // Param id: The user ID to unban
  async unbanUser(id: string) {
    await this.prisma.profile.updateMany({
      where: { userId: id },
      data: { suspendedUntil: null, isAccountBanned: false },
    });
    return this.prisma.user.update({
      where: { id },
      data: { isActive: true, isRootBanned: false },
    });
  }

  // GDPR: Gathers all user-related data for export.
  // Param userId: The user ID to export
  async exportUserData(userId: string) {
    const [account, relations, held] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          createdAt: true,
          updatedAt: true,
          isActive: true,
          role: true,
          dateOfBirth: true,
          identityVerifiedAt: true,
          signupCountry: true,
          signupIp: true,
          lastIp: true,
          botLabeledAt: true,
          deviceSignals: {
            select: {
              firstSeenAt: true,
              lastSeenAt: true,
            },
          },
          // Every way the person signs in: the email and since when. Never
          // a password, a token or a second-step secret.
          signIns: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              email: true,
              emailVerified: true,
              isTwoFactorEnabled: true,
              createdAt: true,
              profiles: { select: { username: true } },
            },
          },
          // What the person did on Business Profiles of others or their own,
          // as a team member or owner.
          profileActivities: {
            orderBy: { createdAt: 'asc' },
            select: {
              action: true,
              targetId: true,
              createdAt: true,
              profile: { select: { username: true } },
            },
          },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          profiles: {
            include: {
              posts: {
                include: {
                  media: true,
                  _count: { select: { likes: true, comments: true } },
                },
              },
              stories: {
                select: {
                  id: true,
                  url: true,
                  mediaType: true,
                  createdAt: true,
                  expiresAt: true,
                  isCloseFriendsOnly: true,
                },
              },
              likes: {
                select: { id: true, postId: true, createdAt: true },
              },
              notifications: {
                select: {
                  id: true,
                  type: true,
                  content: true,
                  read: true,
                  createdAt: true,
                  postId: true,
                  storyId: true,
                },
              },
              collections: {
                select: {
                  id: true,
                  name: true,
                  coverUrl: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
              followers: {
                include: {
                  follower: {
                    select: { username: true },
                  },
                },
              },
              following: {
                include: {
                  following: {
                    select: { username: true },
                  },
                },
              },
              comments: true,
              bookmarks: { include: { post: { select: { caption: true } } } },
              messages: {
                select: {
                  id: true,
                  conversationId: true,
                  content: true,
                  url: true,
                  mediaType: true,
                  voiceUrl: true,
                  postId: true,
                  storyId: true,
                  createdAt: true,
                  updatedAt: true,
                  isEdited: true,
                  isDeleted: true,
                  expiresAt: true,
                },
              },
              reports: true,
            },
          },
          settings: true,
          appeals: true,
          sentTransactions: {
            select: {
              id: true,
              type: true,
              amount: true,
              currency: true,
              status: true,
              createdAt: true,
              receiverId: true,
            },
          },
          receivedTransactions: {
            select: {
              id: true,
              type: true,
              amount: true,
              currency: true,
              status: true,
              createdAt: true,
              senderId: true,
            },
          },
        },
      }),
      this.heldAboutTheAccount(userId),
    ]);

    if (!account || !relations) throw new Error('User not found');

    // Explicit allowlist — scalars from `account` select; never dump secrets/hashes.
    // Messages are decrypted: the person receives what they wrote.
    const safeData = {
      id: account.id,
      email: account.email,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      isActive: account.isActive,
      role: account.role,
      dateOfBirth: account.dateOfBirth,
      identityVerifiedAt: account.identityVerifiedAt,
      // As the account's: that of its first sign-in.
      emailVerified: account.signIns?.[0]?.emailVerified ?? null,
      signIns: (account.signIns ?? []).map((signIn) => ({
        email: signIn.email,
        emailVerified: signIn.emailVerified,
        twoFactorEnabled: signIn.isTwoFactorEnabled,
        createdAt: signIn.createdAt,
        profiles: signIn.profiles.map((profile) => profile.username),
      })),
      teamActivity: (account.profileActivities ?? []).map((activity) => ({
        action: activity.action,
        on: activity.profile.username,
        targetId: activity.targetId,
        at: activity.createdAt,
      })),
      signupCountry: account.signupCountry,
      signupIp: account.signupIp,
      lastIp: account.lastIp,
      botLabeledAt: account.botLabeledAt,
      network: {
        note: 'IP addresses are kept for 90 days for security and abuse prevention; after that only a keyed hash is kept. They are included here for transparency.',
        signupIp: account.signupIp,
        lastIp: account.lastIp,
        signupCountry: account.signupCountry,
      },
      devices: {
        note: 'Device fingerprints are stored as hashes only; hashes are not exported.',
        count: account.deviceSignals.length,
        items: account.deviceSignals.map((d) => ({
          firstSeenAt: d.firstSeenAt,
          lastSeenAt: d.lastSeenAt,
        })),
      },
      profiles: relations.profiles.map((p) => ({
        ...p,
        messages: p.messages.map((m) => ({
          ...m,
          content: m.content ? this.crypto.decrypt(m.content) : m.content,
        })),
      })),
      settings: relations.settings,
      appeals: relations.appeals,
      reportsFiled: undefined, // removed because reports are on profiles
      sentTransactions: relations.sentTransactions,
      receivedTransactions: relations.receivedTransactions,
      ...held,
    };

    return safeData as Record<string, unknown>;
  }

  // The rest of what is kept about the person, for the export: warnings and
  // strikes, spam review cases, searches, what they viewed and did, support
  // requests, plans, unlocks, experiments and the notes staff wrote about
  // them. Who on the staff wrote or decided is not included.
  private async heldAboutTheAccount(userId: string) {
    const byProfile = { profile: { userId } };
    const [
      strikes,
      riskCases,
      searches,
      interactions,
      postViews,
      storyViews,
      supportRequests,
      plans,
      postUnlocks,
      messageUnlocks,
      storyUnlocks,
      experiments,
      staffNotes,
      webPushDevices,
      appPushDevices,
    ] = await Promise.all([
      this.prisma.profileStrike.findMany({
        where: byProfile,
        orderBy: { createdAt: 'asc' },
        select: {
          profileId: true,
          kind: true,
          reason: true,
          consequence: true,
          reportId: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
        },
      }),
      this.prisma.riskCase.findMany({
        where: byProfile,
        orderBy: { createdAt: 'asc' },
        select: {
          profileId: true,
          score: true,
          status: true,
          restrictedAt: true,
          restrictedUntil: true,
          decision: true,
          reviewedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.searchHistory.findMany({
        where: byProfile,
        orderBy: { createdAt: 'asc' },
        select: { profileId: true, query: true, createdAt: true },
      }),
      this.prisma.interactionEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          eventType: true,
          targetType: true,
          targetId: true,
          dwellTime: true,
          createdAt: true,
        },
      }),
      this.prisma.postView.findMany({
        where: { viewer: { userId } },
        orderBy: { createdAt: 'asc' },
        select: { viewerId: true, postId: true, createdAt: true },
      }),
      this.prisma.storyView.findMany({
        where: { viewer: { userId } },
        orderBy: { createdAt: 'asc' },
        select: { viewerId: true, storyId: true, createdAt: true },
      }),
      this.prisma.supportTicket.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          reference: true,
          email: true,
          subject: true,
          message: true,
          category: true,
          status: true,
          createdAt: true,
          resolvedAt: true,
          messages: {
            orderBy: { createdAt: 'asc' },
            select: {
              authorKind: true,
              visibility: true,
              body: true,
              createdAt: true,
            },
          },
          rating: { select: { score: true, comment: true, createdAt: true } },
        },
      }),
      this.prisma.platformSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          profileId: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          createdAt: true,
          plan: { select: { name: true } },
        },
      }),
      this.prisma.postUnlock.findMany({
        where: { userId },
        select: { postId: true, pricePaid: true, createdAt: true },
      }),
      this.prisma.messageUnlock.findMany({
        where: { userId },
        select: { messageId: true, pricePaid: true, createdAt: true },
      }),
      this.prisma.storyUnlock.findMany({
        where: { userId },
        select: { storyId: true, pricePaid: true, createdAt: true },
      }),
      this.prisma.userExperiment.findMany({
        where: { userId },
        select: { experimentKey: true, variant: true, createdAt: true },
      }),
      this.prisma.staffNote.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { body: true, createdAt: true },
      }),
      // Devices that receive push: when each was added, never the keys or
      // tokens, which would let anyone send to them.
      this.prisma.pushSubscription.findMany({
        where: { userId },
        select: { createdAt: true },
      }),
      this.prisma.nativePushToken.findMany({
        where: { userId },
        select: { platform: true, createdAt: true, lastSeenAt: true },
      }),
    ]);
    return {
      warningsAndStrikes: strikes,
      spamReviewCases: riskCases,
      searchHistory: searches,
      activity: { interactions, postViews, storyViews },
      supportRequests,
      platformPlans: plans,
      unlocks: {
        posts: postUnlocks,
        messages: messageUnlocks,
        stories: storyUnlocks,
      },
      experiments,
      staffNotes,
      pushDevices: { browsers: webPushDevices, apps: appPushDevices },
    };
  }

  // Atomically deletes a user scheduled for deletion, guarding against concurrent restoration.
  // Returns true if the account was deleted, false if the account was restored or cancelled concurrently.
  async deleteScheduledUser(userId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Every file its Profiles uploaded, read before the cascade leaves
      // their records without an owner (TD-008). Files of other people that
      // its rows name are not among them.
      const files = await tx.storedFile.findMany({
        where: { profile: { userId } },
        select: { key: true },
      });
      const result = await tx.user.deleteMany({
        where: {
          id: userId,
          isActive: false,
          OR: [
            { scheduledDeletionAt: { not: null } },
            { deletedAt: { not: null } },
          ],
        },
      });
      if (result.count === 0) return false;
      // Queued with the deletion itself: both happen, or neither. In batches,
      // so that one failure retries a few hundred files, not all of them.
      const keys = files.map((file) => file.key);
      for (let i = 0; i < keys.length; i += ERASE_FILES_PER_JOB) {
        await this.uploads.scheduleMediaDeletion(
          keys.slice(i, i + ERASE_FILES_PER_JOB),
          { tx },
        );
      }
      return true;
    });
  }

  // Schedule user account for deletion after 30 days (GDPR grace window).
  // Atomically persists the soft-delete state and enqueues the hard-delete job
  // via OutboxService inside a single Prisma transaction, eliminating the
  // dual-write gap that could cause a missed deletion if the process crashes
  // between the DB write and the BullMQ enqueue.
  //
  // Recovery: the cleanExpiredAccounts cron re-queues any orphaned deletions
  // (scheduledDeletionAt <= now) as a fallback, ensuring no deletion is lost.
  //
  // Param userId: The user ID
  // Returns The scheduled hard-deletion date
  async scheduleDeletion(userId: string) {
    const now = new Date();
    const scheduledDeletionAt = new Date(now);
    scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + 30);
    const delayMs = 30 * 24 * 60 * 60 * 1000;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          deletedAt: now,
          scheduledDeletionAt,
        } satisfies Prisma.UserUpdateInput,
      });

      await tx.refreshToken.deleteMany({
        where: { userId },
      });

      // Enqueue hard-delete job atomically with the DB state change.
      // The OutboxService sweeper guarantees delivery even after a crash.
      await this.outboxService.enqueue(tx, {
        queueName: 'users-processing',
        eventName: 'hard-delete-user',
        payload: { userId },
        options: {
          delay: delayMs,
          jobId: `delete-${userId}`,
          removeOnComplete: true,
          removeOnFail: false,
        },
      });
    });

    const deleteEvent: UserSessionTerminateEvent['payload'] = {
      userId,
      reason: 'Account scheduled for deletion',
    };
    this.eventEmitter.emit('user.session.terminate', deleteEvent);

    // Trigger immediate outbox publish for sub-second delivery after commit.
    this.outboxService.triggerImmediatePublish();

    return scheduledDeletionAt;
  }

  // Cancel a pending scheduled deletion within the grace window.
  // Param userId: The user ID
  async cancelScheduledDeletion(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (!user.scheduledDeletionAt) {
      throw new Error('No scheduled deletion to cancel');
    }
    if (user.scheduledDeletionAt <= new Date()) {
      throw new Error('Deletion grace window has expired');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        deletedAt: null,
        scheduledDeletionAt: null,
      } satisfies Prisma.UserUpdateInput,
    });

    try {
      const job = await this.usersQueue.getJob(`delete-${userId}`);
      if (job) await job.remove();
    } catch {
      // Job may already have been consumed; cron purge still respects scheduledDeletionAt.
    }

    return {
      success: true,
      message: 'Account restoration scheduled deletion cancelled',
    };
  }

  // Get user settings, creating defaults if not exists.
  // Param userId: The user ID
  // The private choice and the push switch are those of the Profile the
  // session acts as; the rest belongs to the person.
  async getSettings(userId: string, profileId: string) {
    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await this.prisma.userSettings.create({
        data: { userId },
      });
    }

    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, userId },
      select: { privacyLevel: true, ...PROFILE_PUSH_SELECT },
    });
    return {
      ...settings,
      privacyLevel: profile?.privacyLevel ?? Visibility.PUBLIC,
      pushNotifications: profile?.pushNotifications ?? true,
      pushLikes: profile?.pushLikes ?? true,
      pushComments: profile?.pushComments ?? true,
      pushFollows: profile?.pushFollows ?? true,
      pushMessages: profile?.pushMessages ?? true,
      pushLive: profile?.pushLive ?? true,
    };
  }

  // Update user settings.
  // Param userId: The user ID
  // Param dto: Settings update data
  async updateSettings(
    userId: string,
    profileId: string,
    dto: UpdateSettingsDto,
  ) {
    const owned = await this.prisma.profile.findFirst({
      where: { id: profileId, userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Profile not found');

    await this.prisma.$transaction(async (tx) => {
      // What belongs to the person.
      await tx.userSettings.upsert({
        where: { userId },
        update: {
          contentPreference: dto.contentPreference as ContentRating,
          blurSensitiveContent: dto.blurSensitiveContent,
          emailNotifications: dto.emailNotifications,
          newsletter: dto.newsletter,
          ...(dto.country !== undefined && { country: dto.country }),
          ...(dto.isOnboarded !== undefined && {
            isOnboarded: dto.isOnboarded,
          }),
        },
        create: {
          userId,
          contentPreference:
            (dto.contentPreference as ContentRating) || ContentRating.GENERAL,
          blurSensitiveContent: dto.blurSensitiveContent ?? true,
          emailNotifications: dto.emailNotifications ?? true,
          newsletter: dto.newsletter ?? true,
          country: dto.country ?? null,
          isOnboarded: dto.isOnboarded ?? false,
        },
      });
      // What belongs to the Profile the session acts as.
      const push = Object.fromEntries(
        PROFILE_PUSH_FIELDS.filter((f) => dto[f] !== undefined).map((f) => [
          f,
          dto[f],
        ]),
      );
      if (Object.keys(push).length > 0) {
        await tx.profile.update({ where: { id: profileId }, data: push });
      }
      if (dto.privacyLevel !== undefined) {
        await setProfilePrivacy(tx, profileId, dto.privacyLevel as Visibility);
      }
    });
    return this.getSettings(userId, profileId);
  }

  async updateLocale(userId: string, locale: Locale) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { locale },
      select: { locale: true },
    });
    return { locale: user.locale };
  }

  // Identity Verification

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

  // Resolve CircleSfera user from Stripe Identity session metadata or stored session id.
  private async resolveIdentityUserId(
    session: Pick<Stripe.Identity.VerificationSession, 'id' | 'metadata'>,
  ): Promise<string | null> {
    const metaUserId = session.metadata?.userId;
    if (metaUserId) {
      return metaUserId;
    }
    if (!session.id) {
      return null;
    }
    const user = await this.prisma.user.findFirst({
      where: { stripeIdentitySessionId: session.id },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  // Persist KYC success from a verified Stripe Identity session.
  // A verified identity sets the date of birth from the document. Under 16,
  // the minimum age, the account is deactivated automatically: the person is
  // told why and how to ask a person to review it, and the staff audit log
  // records it. Verifying never reactivates an account that staff or a
  // deletion request had deactivated.
  private async applyVerifiedIdentity(
    userId: string,
    session: Stripe.Identity.VerificationSession,
  ) {
    const dob = session.verified_outputs?.dob;
    let dateOfBirth: Date | null = null;
    let underMinimumAge = false;

    if (dob?.year && dob?.month && dob?.day) {
      dateOfBirth = new Date(dob.year, dob.month - 1, dob.day);

      const today = new Date();
      let age = today.getFullYear() - dateOfBirth.getFullYear();
      const m = today.getMonth() - dateOfBirth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dateOfBirth.getDate())) {
        age--;
      }
      underMinimumAge = age < 16;
    }

    // KYC sets identityVerifiedAt only — plan badges stay on verificationLevel.
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        identityVerifiedAt: new Date(),
        ...(dateOfBirth && { dateOfBirth }),
      },
    });

    if (underMinimumAge) {
      await this.deactivateUnderMinimumAge(userId);
    }
  }

  // Closes an account whose identity check showed an age under 16. The
  // state, the audit entry and the email go together in one transaction,
  // the email through the outbox, so a failure after it never leaves the
  // person without notice; only the delivery that deactivates does it.
  private async deactivateUnderMinimumAge(userId: string) {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        profiles: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: { fullName: true },
        },
      },
    });
    const mail = account?.email
      ? await this.emailService.underMinimumAgeMail(
          account.email,
          account.profiles[0]?.fullName,
        )
      : null;

    const closed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { id: userId, isActive: true },
        data: { isActive: false },
      });
      if (result.count === 0) return false;
      await tx.adminAuditLog.create({
        data: {
          action: AdminAction.BAN_USER,
          targetType: 'user',
          targetId: userId,
          details:
            'Deactivated automatically: the identity check showed an age under 16',
        },
      });
      await tx.refreshToken.deleteMany({ where: { userId } });
      if (mail) {
        await this.outboxService.enqueue(tx, {
          queueName: QUEUE_NAMES.EMAIL_PROCESSING,
          eventName: 'send-transactional-email',
          payload: { ...mail },
          options: { jobId: `under-minimum-age-${userId}` },
        });
      }
      return true;
    });
    if (!closed) return;

    // Sockets opened before keep their session until told.
    const event: UserSessionTerminateEvent['payload'] = {
      userId,
      reason: 'Account deactivated: under the minimum age',
    };
    this.eventEmitter.emit('user.session.terminate', event);
    this.outboxService.triggerImmediatePublish();
    this.logger.log(
      'An account was deactivated: identity check under the minimum age',
    );
  }

  async handleIdentityWebhook(session: Stripe.Identity.VerificationSession) {
    const userId = await this.resolveIdentityUserId(session);
    if (!userId) {
      console.warn(
        `Identity webhook session ${session.id ?? 'unknown'} has no resolvable user`,
      );
      return;
    }

    if (session.status === 'verified') {
      await this.applyVerifiedIdentity(userId, session);
      return;
    }

    // Incomplete / abandoned sessions: clear so the user can start a new flow
    if (session.status === 'canceled' || session.status === 'requires_input') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeIdentitySessionId: null },
      });
    }
  }

  async syncIdentitySession(userId: string): Promise<{ status: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        stripeIdentitySessionId: true,
        identityVerifiedAt: true,
      },
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
      await this.applyVerifiedIdentity(userId, session);
      return { status: 'verified' };
    }

    if (session.status === 'canceled' || session.status === 'requires_input') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeIdentitySessionId: null },
      });
      return { status: session.status };
    }

    return { status: session.status };
  }

  // Derives each Profile's VerificationLevel from its active platform plans.
  // Plans sell verification and status only: Account Type is chosen by the
  // user and is never written here, and monetization never requires a plan.
  // Param userId: The user ID
  async syncUserTier(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profiles: {
          include: {
            platformSubscriptions: {
              where: {
                status: {
                  in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
                },
              },
              include: { plan: true },
            },
          },
        },
      },
    });

    if (!user) return;

    for (const profile of user.profiles ?? []) {
      const planNames = profile.platformSubscriptions.map((sub) =>
        sub.plan.name.toLowerCase(),
      );
      const has = (keyword: string) =>
        planNames.some((name) => name.includes(keyword));

      // Highest tier wins. The €9.99 plan is named Premium; 'verified' is its
      // former name and still counts for plans created before the rename.
      const targetVerificationLevel: VerificationLevel = has('business')
        ? VerificationLevel.BUSINESS
        : has('elite')
          ? VerificationLevel.ELITE
          : has('verified') || has('premium')
            ? VerificationLevel.VERIFIED
            : VerificationLevel.BASIC;

      if (profile.verificationLevel !== targetVerificationLevel) {
        await this.prisma.profile.update({
          where: { id: profile.id },
          data: { verificationLevel: targetVerificationLevel },
        });
        // The public profile is cached with what the old level allowed.
        await this.cacheManager.del(`profile:${profile.username}`);
        this.logger.log(
          `Profile ${profile.id} verification synced: ${targetVerificationLevel}`,
        );
      }
      // The team pauses when the Business plan ends and returns with it.
      await followTeamPlan(this.prisma, profile.id);
    }
  }
}
