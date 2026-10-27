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
import {
  BUSINESS_PROFILE_LIMIT,
  canPersonalizeProfile,
  PROFILE_LIMIT,
} from '../common/constants/profile-personalization.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import {
  isBlockedEitherWay,
  visibleToViewerWhere,
} from '../common/policies/block.policy.js';
import { setProfilePrivacy } from '../common/policies/profile-privacy.policy.js';
import { NOT_REMOVED } from '../common/policies/removed-content.policy.js';
import { buildMediaCreateInput } from '../common/utils/media-lifecycle.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { activeStrikeWhere } from '../strikes/profile-strikes.constants.js';
import { followTeamPlan } from '../team/team-plan.js';
import { StoredFilesService } from '../uploads/services/stored-files.service.js';
import { UsersService } from '../users/users.service.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

// Service for profile CRUD, username validation, and account lifecycle (deactivate/delete).
// Uses cache-manager for profile read caching.
// What anyone may read of a Profile, with or without a session. Nothing
// that tells who the person or the sign-in behind it is (so two Profiles of
// one person cannot be linked), how it was sanctioned, or how it is set up.
const PUBLIC_PROFILE_FIELDS = [
  'id',
  'username',
  'fullName',
  'bio',
  'avatar',
  'standardUrl',
  'thumbnailUrl',
  'cover',
  'coverStandardUrl',
  'coverThumbnailUrl',
  'website',
  'location',
  'createdAt',
  'updatedAt',
  'verificationLevel',
  'accountType',
  'accentColor',
  'privacyLevel',
  'isPrivate',
  'isVerified',
  'companyVerified',
  'identityVerified',
  'emailConfirmed',
  'joinedAt',
  'signupCountry',
  'strikeCount',
  'botLabeled',
  'lastActiveBucket',
  'accountStanding',
  '_count',
] as const;

export function publicProfileView<T extends object>(profile: T) {
  const source = profile as Record<string, unknown>;
  const view: Record<string, unknown> = {};
  for (const field of PUBLIC_PROFILE_FIELDS) {
    if (field in source) view[field] = source[field];
  }
  // Counts of what anyone can see; strikes are given as strikeCount.
  const counts = source._count as Record<string, unknown> | undefined;
  if (counts) {
    view._count = {
      posts: counts.posts,
      followers: counts.followers,
      following: counts.following,
    };
  }
  return view as { id: string } & Record<string, unknown>;
}

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectQueue('ai-processing') private readonly aiQueue: Queue,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(StoredFilesService)
    private readonly storedFiles: StoredFilesService,
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
      // A view cached before the list of fields was closed is cut to it too.
      return publicProfileView(cachedProfile);
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
            identityVerifiedAt: true,
            signupCountry: true,
            botLabeledAt: true,
          },
        },
        // Whether the Profile's email is confirmed is its sign-in's.
        signIn: { select: { emailVerified: true } },
        _count: {
          select: {
            posts: { where: NOT_REMOVED },
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

    // The badge comes from a plan of this Profile, not of another Profile of
    // the same person.
    const isVerifiedResult = await this.prisma.platformSubscription.findFirst({
      where: {
        profileId: profile.id,
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

    const companyVerified = await this.isVerifiedCompany(profile);

    // The sign-in is read only to say whether the email is confirmed.
    const { user, signIn } = profile;
    const profileWithFields = publicProfileView({
      ...profile,
      verificationLevel: profile.verificationLevel,
      accountType: profile.accountType,
      privacyLevel: profile.privacyLevel,
      isPrivate: profile.privacyLevel === Visibility.PRIVATE,
      isVerified: planVerified,
      companyVerified,
      // The chosen colour shows only while the plan that includes it is
      // active; the choice itself stays stored.
      accentColor: canPersonalizeProfile(profile.verificationLevel)
        ? profile.accentColor
        : null,
      identityVerified: !!user?.identityVerifiedAt,
      emailConfirmed: !!signIn?.emailVerified,
      // When this Profile was created: the person's own sign-up date is the
      // same on all their Profiles and would tie them together.
      joinedAt: profile.createdAt?.toISOString?.() ?? profile.createdAt,
      signupCountry: user?.signupCountry ?? null,
      // Active strikes of this Profile; warnings are not shown.
      strikeCount: profile._count.strikes,
      botLabeled: !!user?.botLabeledAt,
      lastActiveBucket: lastActiveBucket(user?.lastSeenAt),
      accountStanding: accountStanding({
        isActive: user?.isActive ?? true,
        suspendedUntil: profile.suspendedUntil ?? null,
      }),
    });

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
        privacyLevel: true,
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

    // A new photo must be the Profile's own stored file; the one it has is
    // sent back as it is.
    if (dto.avatar !== undefined && dto.avatar !== profile.avatar) {
      await this.storedFiles.assertOwnedBy(profileId, [dto.avatar]);
    }

    if (dto.accentColor && !canPersonalizeProfile(profile.verificationLevel)) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'Choosing a Profile colour needs the Elite Creator or Business plan',
      );
    }

    const { isPrivate, ...profileData } = dto;

    // Private or public is this Profile's own choice.
    if (isPrivate !== undefined) {
      await setProfilePrivacy(
        this.prisma,
        profileId,
        isPrivate ? Visibility.PRIVATE : Visibility.PUBLIC,
      );
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

    // A Profile that stops being a Business Profile pauses its team.
    if (profileData.accountType !== undefined) {
      await followTeamPlan(this.prisma, profileId);
    }

    // Flatten for UI convenience
    const flattened = {
      ...updated,
      accountType: updated.accountType,
      verificationLevel: updated.verificationLevel,
      isPrivate: updated.privacyLevel === 'PRIVATE',
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

  // Param signInId: the sign-in of the session; its email and whether it is
  // verified are what the person reads about how they are signed in
  async getMyProfile(profileId: string, signInId?: string) {
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
            identityVerifiedAt: true,
            signupCountry: true,
            botLabeledAt: true,
            locale: true,
            settings: {
              select: { isOnboarded: true },
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

    // The badge comes from a plan of this Profile.
    const isVerifiedResult = await this.prisma.platformSubscription.findFirst({
      where: {
        profileId: profile.id,
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

    const companyVerified = await this.isVerifiedCompany(profile);
    // The sign-in of the session, inside the account of this Profile; a
    // session that names none reads the Profile's own sign-in.
    const sessionSignIn = await this.prisma.signIn.findFirst({
      where: signInId
        ? { id: signInId, userId: profile.userId }
        : { profiles: { some: { id: profile.id } } },
      select: { email: true, emailVerified: true, isTwoFactorEnabled: true },
    });
    const signedInWith = sessionSignIn;

    // Flatten for UI convenience
    return {
      ...profile,
      companyVerified,
      accountType: profile.accountType,
      verificationLevel: profile.verificationLevel,
      identityVerifiedAt: profile.user?.identityVerifiedAt,
      identityVerified: !!profile.user?.identityVerifiedAt,
      emailConfirmed: !!signedInWith?.emailVerified,
      emailVerified: signedInWith?.emailVerified,
      joinedAt: profile.createdAt,
      signupCountry: profile.user?.signupCountry ?? null,
      strikeCount: profile._count.strikes,
      botLabeled: !!profile.user?.botLabeledAt,
      lastActiveBucket: lastActiveBucket(profile.user?.lastSeenAt),
      accountStanding: accountStanding({
        isActive: profile.user?.isActive ?? true,
        suspendedUntil: profile.suspendedUntil ?? null,
      }),
      isPrivate: profile.privacyLevel === 'PRIVATE',
      isVerified: planVerified,
      // The email shown is the one the person is signed in with.
      user: profile.user && {
        ...profile.user,
        email: signedInWith?.email ?? profile.user.email,
        emailVerified: signedInWith?.emailVerified ?? null,
        // The second step of the sign-in in use, for its settings switch.
        isTwoFactorEnabled: signedInWith?.isTwoFactorEnabled ?? false,
      },
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

  // The Profile of a session acting as a team member (ADR-0028): what anyone
  // may see of it, and the person's role. Nothing of the owner's account,
  // settings or sign-in.
  async getMemberProfile(profileId: string, memberRole: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { username: true },
    });
    if (!profile) {
      throw AppException.NotFound(
        ErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
      );
    }
    const view = (await this.getProfile(profile.username)) as Record<
      string,
      unknown
    >;
    return { ...view, memberRole };
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
            posts: { where: NOT_REMOVED },
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

  // "Verified company": the Business plan, and a payout account that the
  // payment provider has verified as a company. The account is looked up only
  // for a Profile on that plan.
  private async isVerifiedCompany(profile: {
    userId: string;
    verificationLevel: string | null;
  }): Promise<boolean> {
    if (profile.verificationLevel !== 'BUSINESS') return false;
    const monetization = await this.prisma.monetization.findUnique({
      where: { userId: profile.userId },
      select: { verifiedCompany: true },
    });
    return !!monetization?.verifiedCompany;
  }

  // Create an additional profile under the authenticated user identity:
  // up to 5 per identity, 10 when one of its Profiles is on the Business plan.
  async createProfile(userId: string, dto: CreateProfileDto) {
    // The photo of a new Profile is uploaded while acting as another Profile
    // of the same person: any of their Profiles' stored files will do.
    if (dto.avatar) {
      const own = await this.prisma.profile.findMany({
        where: { userId },
        select: { id: true },
      });
      await this.storedFiles.assertOwnedBy(
        own.map((p) => p.id),
        [dto.avatar],
      );
    }
    const profileCount = await this.prisma.profile.count({
      where: { userId },
    });
    // The plan is only looked up when it can change the answer.
    const onBusinessPlan =
      profileCount >= PROFILE_LIMIT &&
      !!(await this.prisma.profile.findFirst({
        where: { userId, verificationLevel: 'BUSINESS' },
        select: { id: true },
      }));
    const limit = onBusinessPlan ? BUSINESS_PROFILE_LIMIT : PROFILE_LIMIT;
    if (profileCount >= limit) {
      throw AppException.BadRequest(
        ErrorCode.INVALID_INPUT,
        `Maximum limit of ${limit} profiles per user identity reached`,
      );
    }

    const availability = await this.checkUsernameAvailability(dto.username);
    if (!availability.available) {
      throw AppException.BadRequest(
        ErrorCode.INVALID_INPUT,
        availability.message,
      );
    }

    const profile = await this.prisma.$transaction(async (tx) => {
      const created = await tx.profile.create({
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
      // The photo becomes the new Profile's: deleting the Profile it was
      // uploaded from must not take it, and deleting this one must.
      if (dto.avatar) {
        await tx.storedFile.updateMany({
          where: { key: dto.avatar, profileId: { not: null } },
          data: { profileId: created.id },
        });
      }
      return created;
    });

    const embeddingText = this.buildProfileEmbeddingText(profile);
    if (embeddingText) {
      await this.enqueueProfileEmbedding(profile.id, embeddingText);
    }

    return profile;
  }

  // Validate that a profile belongs to the authenticated user, or is one
  // they work on as an active team member, and is operational for switching.
  async switchProfile(userId: string, targetProfileId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: targetProfileId },
    });
    const isMember =
      !!profile &&
      profile.userId !== userId &&
      (
        await this.prisma.profileMember.findUnique({
          where: { profileId_userId: { profileId: profile.id, userId } },
          select: { status: true },
        })
      )?.status === 'ACTIVE';

    if (!profile || (profile.userId !== userId && !isMember)) {
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
