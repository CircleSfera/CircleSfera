import {
  AD_CONSENT_NO_REASK_MONTHS,
  AD_CONSENT_TEXT_VERSION,
  AD_PERSONALISATION_MIN_AGE,
  ADS_CONSENT_FLAG,
  type AdChoice,
  type AdConsentSource,
  type AdConsentStatus,
  ageOn,
  ErrorCode,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Locale } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { ExperimentsService } from '../experiments/experiments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface LatestAnswer {
  choice: AdChoice;
  textVersion: string;
  createdAt: Date;
}

export interface AdConsentAnswer {
  choice: AdChoice;
  textVersion: string;
  locale: Locale;
  source: AdConsentSource;
}

/** The day, AD_CONSENT_NO_REASK_MONTHS before `now`. */
function noReaskSince(now: Date): Date {
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - AD_CONSENT_NO_REASK_MONTHS);
  return since;
}

/**
 * Whether the screen must be shown, by the rules of PD-084 (Notion →
 * Product → Product Specifications → Advertising: Pixel, Conversions and
 * Audiences, section 3): never under 18; once to whoever never answered;
 * again only when the texts changed, and after a "no" not before
 * AD_CONSENT_NO_REASK_MONTHS have passed.
 */
export function shouldAsk(
  latest: LatestAnswer | null,
  adult: boolean,
  now: Date = new Date(),
): boolean {
  if (!adult) return false;
  if (!latest) return true;
  if (latest.textVersion === AD_CONSENT_TEXT_VERSION) return false;
  if (latest.choice === 'GENERAL') {
    return latest.createdAt <= noReaskSince(now);
  }
  return true;
}

/**
 * What applies: PERSONALISED only for an adult whose last answer was
 * PERSONALISED to the texts in force. Everyone else gets general ads.
 */
export function effectiveChoice(
  latest: LatestAnswer | null,
  adult: boolean,
): AdChoice {
  return adult &&
    latest?.choice === 'PERSONALISED' &&
    latest.textVersion === AD_CONSENT_TEXT_VERSION
    ? 'PERSONALISED'
    : 'GENERAL';
}

/**
 * The person's consent to personalised advertising (PD-084). It belongs to
 * the User, not to a Profile: one answer for every Profile of the person.
 * The rules are enforced here whether or not the screen is shown yet (the
 * ads_consent flag only decides what the app shows).
 */
@Injectable()
export class AdsConsentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExperimentsService)
    private readonly experiments: ExperimentsService,
  ) {}

  async status(userId: string): Promise<AdConsentStatus> {
    const [adult, latest, flagOn] = await Promise.all([
      this.isAdult(userId),
      this.latest(userId),
      this.experiments.isFeatureEnabled(ADS_CONSENT_FLAG, userId),
    ]);
    return {
      choice: latest?.choice ?? null,
      decidedAt: latest?.createdAt.toISOString() ?? null,
      textVersion: latest?.textVersion ?? null,
      currentTextVersion: AD_CONSENT_TEXT_VERSION,
      personalisationAllowed: adult,
      effectiveChoice: effectiveChoice(latest, adult),
      askNow: flagOn && shouldAsk(latest, adult),
    };
  }

  /**
   * Records an answer as a new row: the proof of what was chosen, when, and
   * which texts were shown. Withdrawing is the same call as giving.
   */
  async answer(userId: string, answer: AdConsentAnswer) {
    if (answer.textVersion !== AD_CONSENT_TEXT_VERSION) {
      // The app showed texts that are no longer in force: what it shows now
      // is asked instead, so the record never names texts nobody saw.
      throw AppException.Conflict(
        ErrorCode.AD_CONSENT_TEXT_OUTDATED,
        'These texts are no longer the current ones.',
        { currentTextVersion: AD_CONSENT_TEXT_VERSION },
      );
    }
    if (answer.choice === 'PERSONALISED' && !(await this.isAdult(userId))) {
      throw AppException.Forbidden(
        ErrorCode.AD_PERSONALISATION_UNDER_AGE,
        `Personalised ads are only for people ${AD_PERSONALISATION_MIN_AGE} or older.`,
        { minAge: AD_PERSONALISATION_MIN_AGE },
      );
    }
    await this.prisma.adConsent.create({
      data: {
        userId,
        choice: answer.choice,
        textVersion: answer.textVersion,
        locale: answer.locale,
        source: answer.source,
      },
    });
    return this.status(userId);
  }

  /**
   * Whether ads for this person may use their activity on advertisers'
   * websites and apps and advertisers' audiences. For the ad server: false
   * unless an adult said yes to the texts in force.
   */
  async allowsPersonalisedAds(userId: string): Promise<boolean> {
    const [adult, latest] = await Promise.all([
      this.isAdult(userId),
      this.latest(userId),
    ]);
    return effectiveChoice(latest, adult) === 'PERSONALISED';
  }

  // By the date of birth on the account, as payments read it: an account
  // without one is treated as under age.
  private async isAdult(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true },
    });
    return (
      !!user?.dateOfBirth &&
      ageOn(user.dateOfBirth) >= AD_PERSONALISATION_MIN_AGE
    );
  }

  private latest(userId: string): Promise<LatestAnswer | null> {
    return this.prisma.adConsent.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { choice: true, textVersion: true, createdAt: true },
    });
  }
}
