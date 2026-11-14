import { ageOn, ErrorCode, PAYER_MIN_AGE } from '@circlesfera/shared';
import type { Prisma } from '@prisma/client';
import { AppException } from '../errors/app.exception.js';

/**
 * Only an adult pays on CircleSfera: a person with an identity verified by
 * document who is PAYER_MIN_AGE or older by its date of birth. A date only
 * typed at sign-up, or none, does not count. Asked before any checkout
 * opens: plans and promotions. The app itself is open from a younger age.
 */
export async function assertAdultPayer(
  db: Pick<Prisma.TransactionClient, 'user'>,
  userId: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      identityVerifiedAt: true,
      dateOfBirth: true,
      dateOfBirthVerified: true,
    },
  });
  const adult =
    !!user?.identityVerifiedAt &&
    user.dateOfBirthVerified &&
    !!user.dateOfBirth &&
    ageOn(user.dateOfBirth) >= PAYER_MIN_AGE;
  if (!adult) {
    throw AppException.Forbidden(
      ErrorCode.PAYER_UNDER_AGE,
      `Only people ${PAYER_MIN_AGE} or older, with a verified identity, can pay.`,
      { minAge: PAYER_MIN_AGE },
    );
  }
}
