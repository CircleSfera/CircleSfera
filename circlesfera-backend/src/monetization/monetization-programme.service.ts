import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { canMonetize } from '../common/constants/monetization.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertOfChargingAge } from './payout-account.js';

// What a Profile sees of its own place in the monetization programme.
const OWN_PROGRAMME_SELECT = {
  monetizationStatus: true,
  monetizationAppliedAt: true,
  monetizationReviewedAt: true,
  monetizationNote: true,
} as const;

// The statuses from which a Profile may apply (again).
const MAY_APPLY = ['NONE', 'REJECTED', 'REVOKED'] as const;

// The monetization programme, as a creator meets it: a Creator or Business
// Profile of an adult with a verified identity applies, saying what it will
// sell, and charges only once staff approve it (see
// AdminMonetizationProgrammeService).
@Injectable()
export class MonetizationProgrammeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async statusOf(userId: string, profileId: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, userId },
      select: OWN_PROGRAMME_SELECT,
    });
    if (!profile) {
      throw AppException.NotFound(
        ErrorCode.USER_NOT_FOUND,
        'Profile not found',
      );
    }
    return {
      status: profile.monetizationStatus,
      appliedAt: profile.monetizationAppliedAt,
      reviewedAt: profile.monetizationReviewedAt,
      note: profile.monetizationNote,
    };
  }

  async apply(userId: string, profileId: string, pitch: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, userId },
      select: {
        accountType: true,
        isAccountBanned: true,
        suspendedUntil: true,
      },
    });
    if (!profile) {
      throw AppException.NotFound(
        ErrorCode.USER_NOT_FOUND,
        'Profile not found',
      );
    }
    if (!canMonetize(profile.accountType)) {
      throw AppException.Forbidden(
        ErrorCode.ACCOUNT_TYPE_NOT_ELIGIBLE_FOR_MONETIZATION,
        'Only Creator or Business accounts can apply.',
      );
    }
    if (
      profile.isAccountBanned ||
      (profile.suspendedUntil && profile.suspendedUntil > new Date())
    ) {
      throw AppException.Forbidden(
        ErrorCode.MONETIZATION_APPLICATION_NOT_OPEN,
        'A banned or suspended Profile cannot apply.',
      );
    }
    await assertOfChargingAge(this.prisma, userId);

    // Only from a status that allows it, read and written at once, so two
    // requests cannot both apply or overwrite a decision.
    const { count } = await this.prisma.profile.updateMany({
      where: {
        id: profileId,
        userId,
        monetizationStatus: { in: [...MAY_APPLY] },
      },
      data: {
        monetizationStatus: 'PENDING',
        monetizationAppliedAt: new Date(),
        monetizationPitch: pitch.trim(),
        monetizationNote: null,
      },
    });
    if (count === 0) {
      throw AppException.Conflict(
        ErrorCode.MONETIZATION_APPLICATION_NOT_OPEN,
        'This Profile already applied or is approved.',
      );
    }
    return this.statusOf(userId, profileId);
  }
}
