import { ageOn, ErrorCode, PAYER_MIN_AGE } from '@circlesfera/shared';
import type { Prisma } from '@prisma/client';
import { AppException } from '../errors/app.exception.js';

/**
 * Only an adult pays on CircleSfera: a person PAYER_MIN_AGE or older by the
 * date of birth on their account (owner decision, 2026-11-23). That is the
 * date given at sign-up, or the one read from an identity document, which
 * replaces it once read. Asked before any checkout opens: plans, the add-on
 * and promotions. The app itself is open from a younger age. Whether the
 * identity must also be verified is decided by what is bought: a plan with
 * the verified badge (assertIdentityForBadge).
 */
export async function assertAdultPayer(
  db: Pick<Prisma.TransactionClient, 'user'>,
  userId: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { dateOfBirth: true },
  });
  const adult = !!user?.dateOfBirth && ageOn(user.dateOfBirth) >= PAYER_MIN_AGE;
  if (!adult) {
    throw AppException.Forbidden(
      ErrorCode.PAYER_UNDER_AGE,
      `Only people ${PAYER_MIN_AGE} or older can pay.`,
      { minAge: PAYER_MIN_AGE },
    );
  }
}

/**
 * A plan with the verified badge is bought only with a verified identity:
 * the badge says the person is who they say they are (owner decision,
 * 2026-11-23). What carries no badge (the add-on, promotions) needs none.
 */
export async function assertIdentityForBadge(
  db: Pick<Prisma.TransactionClient, 'user'>,
  userId: string,
  features: readonly string[],
): Promise<void> {
  if (!features.includes('verified_badge')) return;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { identityVerifiedAt: true },
  });
  if (!user?.identityVerifiedAt) {
    // The code lets the app offer the verification.
    throw AppException.Forbidden(
      ErrorCode.IDENTITY_VERIFICATION_REQUIRED,
      'A plan with the verified badge needs your identity verified first.',
    );
  }
}
