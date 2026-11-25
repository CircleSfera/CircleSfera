import { ageOn } from '@circlesfera/shared';
import type { PrismaService } from '../../prisma/prisma.service.js';

/** Whether a person is old enough for an ads rule, by their date of birth. */
export interface AdAge {
  /** At least the minimum age by the date of birth on the account. */
  adult: boolean;
  /** The account has no date of birth: treated as under age, and said so. */
  missing: boolean;
}

/**
 * The age rule of the ads features (PD-084): personalised ads and interests
 * are never used for anyone under `minAge`. Read by the date of birth on the
 * account, as payments read it; an account without one is treated as under
 * age, and says so.
 */
export function adAgeFrom(
  dateOfBirth: Date | null | undefined,
  minAge: number,
  day: Date = new Date(),
): AdAge {
  return {
    adult: !!dateOfBirth && ageOn(dateOfBirth, day) >= minAge,
    missing: !dateOfBirth,
  };
}

/** adAgeFrom for the person (User) `userId`, read from the database. */
export async function adAgeOf(
  prisma: Pick<PrismaService, 'user'>,
  userId: string,
  minAge: number,
): Promise<AdAge> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dateOfBirth: true },
  });
  return adAgeFrom(user?.dateOfBirth, minAge);
}
