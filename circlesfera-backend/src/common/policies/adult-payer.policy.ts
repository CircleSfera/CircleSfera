import { ErrorCode, MONETIZATION_MIN_AGE } from '@circlesfera/shared';
import type { Prisma } from '@prisma/client';
import { isOfChargingAge } from '../../monetization/payout-account.js';
import { AppException } from '../errors/app.exception.js';

/**
 * Only an adult pays on CircleSfera: a person with an identity verified by
 * document who is MONETIZATION_MIN_AGE or older by its date of birth. Asked
 * before any checkout opens: plans, paid content, tips, live gifts and
 * promotions. The app itself is open from a younger age.
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
  if (!user || !isOfChargingAge(user)) {
    throw AppException.Forbidden(
      ErrorCode.PAYER_UNDER_AGE,
      `Only people ${MONETIZATION_MIN_AGE} or older, with a verified identity, can pay.`,
      { minAge: MONETIZATION_MIN_AGE },
    );
  }
}
