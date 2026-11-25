import { ErrorCode, FOUNDING_CREATOR_FREE_MONTHS } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import {
  AccountType,
  FoundingCreatorStatus,
  type Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ApplyFoundingCreatorDto } from './dto/apply-founding-creator.dto.js';

// What the person sees of their application: never who on the staff decided.
const OWNER_SELECT = {
  id: true,
  status: true,
  links: true,
  city: true,
  note: true,
  createdAt: true,
  decidedAt: true,
  declineReason: true,
  declineNote: true,
  // Whether the year ends at its end because the provider cannot work out
  // the VAT of the person's address.
  freeYearTaxable: true,
  platformSubscription: {
    select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  },
} satisfies Prisma.FoundingCreatorApplicationSelect;

// Where the free year of an approved application stands:
// - STARTED: it was given (its plan says until when).
// - NEEDS_IDENTITY: it waits for the person's identity to be verified, as
//   the badge needs (PD-076); it starts once they start it, never before,
//   so none of the year is lost waiting.
// - HAS_PLAN: the Profile holds a plan, which keeps; no second one is given.
// - READY: the person can start it, accepting its terms: the year counts
//   from then.
export type FreeYearState = 'STARTED' | 'NEEDS_IDENTITY' | 'HAS_PLAN' | 'READY';

// The plans a Profile holds while they run or are owed.
const HELD: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.UNPAID,
];

// The day a free year started at `from` ends: twelve calendar months on,
// as the provider is asked.
export function freeYearEnd(from: Date): Date {
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + FOUNDING_CREATOR_FREE_MONTHS);
  return end;
}

// The links as the person gave them, each once.
export function distinctLinks(links: readonly string[]): string[] {
  return [...new Set(links.map((link) => link.trim()).filter(Boolean))];
}

// Founding creators (BD-034): before the open launch, creators of short
// video and video editors apply from the app. The owner of a Creator
// Profile applies with links to its work, its city and a note; staff decide
// in the Backoffice (FoundingCreatorsReviewService); an approved Profile
// gets the Verified plan free for a year (PaymentsService.startFoundingYear).
// CircleSfera sends the creators nothing: the page shows where they stand.
@Injectable()
export class FoundingCreatorsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  // Where the Profile in use stands. Only its owner sees its application: a
  // team member's session sees none.
  async status(userId: string, profileId: string) {
    const profile = await this.ownProfile(userId, profileId);
    if (!profile) {
      return {
        isOwner: false,
        isCreator: false,
        identityVerified: false,
        application: null,
        freeYear: null,
        freeYearEndsAt: null,
      };
    }
    const application = await this.prisma.foundingCreatorApplication.findFirst({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      select: OWNER_SELECT,
    });
    const identityVerified = !!profile.user?.identityVerifiedAt;
    const freeYear = application
      ? await this.freeYearState(profileId, application, identityVerified)
      : null;
    return {
      isOwner: true,
      isCreator: profile.accountType === AccountType.CREATOR,
      identityVerified,
      application,
      freeYear,
      // The day a year started now would end, for the terms the person
      // accepts before starting it.
      freeYearEndsAt: freeYear === 'READY' ? freeYearEnd(new Date()) : null,
    };
  }

  // Sends an application. A Creator Profile only, by its owner; one
  // waiting or approved at a time (a declined one can be followed by a new
  // one).
  async apply(userId: string, profileId: string, dto: ApplyFoundingCreatorDto) {
    const profile = await this.ownProfile(userId, profileId);
    if (!profile) {
      throw AppException.NotFound(
        ErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
      );
    }
    if (profile.accountType !== AccountType.CREATOR) {
      throw AppException.Forbidden(
        ErrorCode.FOUNDING_CREATOR_PROFILE_TYPE,
        'Only a Creator profile can apply to be a founding creator.',
      );
    }
    const open = await this.prisma.foundingCreatorApplication.findFirst({
      where: {
        profileId,
        status: {
          in: [FoundingCreatorStatus.PENDING, FoundingCreatorStatus.APPROVED],
        },
      },
      select: { id: true },
    });
    if (open) throw this.alreadyApplied();

    try {
      await this.prisma.foundingCreatorApplication.create({
        data: {
          profileId,
          links: distinctLinks(dto.links),
          city: dto.city,
          note: dto.note || null,
        },
      });
    } catch (err) {
      // Two requests at once: the index keeps one.
      if ((err as { code?: string })?.code === 'P2002') {
        throw this.alreadyApplied();
      }
      throw err;
    }
    return this.status(userId, profileId);
  }

  // Starts the free year of the Profile's approved application, by its
  // owner, who accepts its terms in the same request (the DTO refuses a
  // request without the acceptance): never by staff, never without them. One
  // already given is left as it is.
  async startFreeYear(userId: string, profileId: string) {
    const profile = await this.ownProfile(userId, profileId);
    const application = profile
      ? await this.prisma.foundingCreatorApplication.findFirst({
          where: { profileId, status: FoundingCreatorStatus.APPROVED },
          select: { id: true, platformSubscriptionId: true },
        })
      : null;
    if (!application) throw this.notFound();
    if (!application.platformSubscriptionId) {
      await this.payments.startFoundingYear({
        userId,
        profileId,
        applicationId: application.id,
      });
    }
    return this.status(userId, profileId);
  }

  private async freeYearState(
    profileId: string,
    application: {
      status: FoundingCreatorStatus;
      platformSubscription: unknown;
    },
    identityVerified: boolean,
  ): Promise<FreeYearState | null> {
    if (application.status !== FoundingCreatorStatus.APPROVED) return null;
    if (application.platformSubscription) return 'STARTED';
    if (!identityVerified) return 'NEEDS_IDENTITY';
    const held = await this.prisma.platformSubscription.count({
      where: { profileId, addOn: false, status: { in: HELD } },
    });
    return held > 0 ? 'HAS_PLAN' : 'READY';
  }

  // The Profile in use, when the person is its owner.
  private ownProfile(userId: string, profileId: string) {
    return this.prisma.profile.findFirst({
      where: { id: profileId || '__no_profile__', userId },
      select: {
        accountType: true,
        user: { select: { identityVerifiedAt: true } },
      },
    });
  }

  private alreadyApplied() {
    return AppException.Conflict(
      ErrorCode.FOUNDING_CREATOR_ALREADY_APPLIED,
      'This profile already has an application waiting or approved.',
    );
  }

  private notFound() {
    return AppException.NotFound(
      ErrorCode.FOUNDING_CREATOR_NOT_FOUND,
      'There is no approved application to act on.',
    );
  }
}
