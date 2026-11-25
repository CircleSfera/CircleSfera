import {
  AD_INTEREST_TOPICS,
  AD_INTERESTS_FLAG,
  AD_INTERESTS_MAX,
  AD_INTERESTS_MIN_AGE,
  type AdInterestsStatus,
  type AdInterestTopic,
  ErrorCode,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { type AdAge, adAgeOf } from '../common/utils/ad-age.util.js';
import { ExperimentsService } from '../experiments/experiments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const CHOOSABLE = new Set<string>(AD_INTEREST_TOPICS);

/**
 * Whether `topics` is a set of interests a person may choose: topics of the
 * list, never `other`, none twice, at most AD_INTERESTS_MAX. The endpoint's
 * validation checks the same; this keeps every other caller to it.
 */
export function isInterestSet(
  topics: readonly string[],
): topics is AdInterestTopic[] {
  return (
    topics.length <= AD_INTERESTS_MAX &&
    new Set(topics).size === topics.length &&
    topics.every((topic) => CHOOSABLE.has(topic))
  );
}

/** The topics in the order of the list, whatever order they came in. */
function inListOrder(topics: readonly string[]): AdInterestTopic[] {
  const chosen = new Set(topics);
  return AD_INTEREST_TOPICS.filter((topic) => chosen.has(topic));
}

/**
 * The interests a person chooses for their ads (PD-084; Notion → Product →
 * Product Specifications → Advertising: Pixel, Conversions and Audiences,
 * section 2): chosen by the person, visible and editable by them, never
 * worked out from what they do. Of the User, for every Profile of theirs.
 *
 * No interest is taken while the ads flag is off. Someone under 18, or an
 * account without a date of birth, can choose none: none is stored, so
 * none can ever be used for them. Clearing is always possible.
 */
@Injectable()
export class AdInterestsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExperimentsService)
    private readonly experiments: ExperimentsService,
  ) {}

  /** What the person chose, and whether they may choose. */
  async status(userId: string): Promise<AdInterestsStatus> {
    const [age, row] = await Promise.all([
      this.age(userId),
      this.stored(userId),
    ]);
    return {
      // An interest that is not on the list any more is not shown.
      interests: inListOrder(row?.topics ?? []),
      maxInterests: AD_INTERESTS_MAX,
      allowed: age.adult,
      dateOfBirthMissing: age.missing,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  /**
   * Replaces the person's interests with `topics`. An empty list clears
   * them: the row goes, nothing is kept. Clearing is always taken, whatever
   * the flag or the age, so what is stored can always be removed.
   */
  async choose(
    userId: string,
    topics: readonly string[],
  ): Promise<AdInterestsStatus> {
    if (topics.length === 0) {
      await this.prisma.adInterests.deleteMany({ where: { userId } });
      return this.status(userId);
    }
    if (!(await this.flagOn(userId))) {
      // Settings → Ads is not offered yet (Ads 0, the legal review): what
      // nobody was shown is not taken.
      throw AppException.Forbidden(
        ErrorCode.FEATURE_DISABLED,
        'Choosing interests for ads is not available yet.',
      );
    }
    if (!isInterestSet(topics)) {
      throw AppException.BadRequest(
        ErrorCode.AD_INTERESTS_INVALID,
        `Choose up to ${AD_INTERESTS_MAX} different topics from the list.`,
        { max: AD_INTERESTS_MAX },
      );
    }
    const age = await this.age(userId);
    if (!age.adult) {
      // Interests are never used for a minor: none is stored, rather than
      // stored and left unused.
      throw AppException.Forbidden(
        ErrorCode.AD_INTERESTS_UNDER_AGE,
        `Interests are only used for the ads of people ${AD_INTERESTS_MIN_AGE} or older.`,
        { minAge: AD_INTERESTS_MIN_AGE, dateOfBirthMissing: age.missing },
      );
    }
    const ordered = inListOrder(topics);
    await this.prisma.adInterests.upsert({
      where: { userId },
      create: { userId, topics: ordered },
      update: { topics: ordered },
    });
    return this.status(userId);
  }

  /**
   * The interests ads for this person may be chosen by, for the ad server.
   * None while the ads flag is off, and none for someone under 18 or an
   * account without a date of birth, whatever is stored.
   */
  async interestsForAds(userId: string): Promise<AdInterestTopic[]> {
    const [flagOn, age, row] = await Promise.all([
      this.flagOn(userId),
      this.age(userId),
      this.stored(userId),
    ]);
    if (!flagOn || !age.adult) return [];
    return inListOrder(row?.topics ?? []);
  }

  private flagOn(userId: string): Promise<boolean> {
    return this.experiments.isFeatureEnabled(AD_INTERESTS_FLAG, userId);
  }

  private stored(userId: string) {
    return this.prisma.adInterests.findUnique({
      where: { userId },
      select: { topics: true, updatedAt: true },
    });
  }

  // The same rule as the ads consent reads.
  private age(userId: string): Promise<AdAge> {
    return adAgeOf(this.prisma, userId, AD_INTERESTS_MIN_AGE);
  }
}
