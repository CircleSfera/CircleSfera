import { ageOn, ErrorCode, MONETIZATION_MIN_AGE } from '@circlesfera/shared';
import type { Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';

type PayoutAccountReader = Pick<Prisma.TransactionClient, 'profile'>;

/**
 * The Profile a person's row of earnings is placed with while it holds no
 * account, or has lost its Profile: their oldest Creator or Business
 * Profile, else their oldest.
 */
export async function payoutAccountOf(
  db: PayoutAccountReader,
  userId: string,
): Promise<{ profileId: string | null }> {
  const profiles = await db.profile.findMany({
    where: { userId },
    select: { id: true, accountType: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const holder =
    profiles.find((profile) => profile.accountType !== 'PERSONAL') ??
    profiles[0];
  return { profileId: holder?.id ?? null };
}

/**
 * What a write of a person's row of earnings sets for its Profile. A
 * connected account stays with the Profile holding it, even one switched to
 * Personal since, so its balance stays where it was earned. Until an
 * account is connected, or when the row has lost its Profile, the row is
 * placed again with the person's Profiles as they are now: a Creator
 * Profile made after the row was opened from a Personal one gets the
 * account when it is connected. The account itself is only ever written by
 * connecting, never here.
 */
export async function payoutAccountPlacement(
  db: Pick<Prisma.TransactionClient, 'profile' | 'monetization'>,
  userId: string,
): Promise<{ profileId?: string }> {
  const row = await db.monetization.findUnique({
    where: { userId },
    select: { profileId: true, stripeConnectAccountId: true },
  });
  if (row?.profileId && row.stripeConnectAccountId) return {};
  const { profileId } = await payoutAccountOf(db, userId);
  // Never onto a Profile that holds a row of its own.
  const taken =
    profileId && profileId !== row?.profileId
      ? await db.monetization.findUnique({
          where: { profileId },
          select: { id: true },
        })
      : null;
  return profileId && !taken ? { profileId } : {};
}

const PAYOUT_ROW = {
  userId: true,
  profileId: true,
  stripeConnectAccountId: true,
  transfersEnabled: true,
  chargesEnabled: true,
  verifiedCompany: true,
} as const;

/**
 * The row of the payout account that money earned by a Profile goes to: the
 * one the Profile holds once the provider lets it receive transfers, else
 * its person's. A Profile that starts opening an account of its own keeps
 * being paid where it was until that account is ready.
 */
export async function payoutRowForProfile(
  db: Pick<Prisma.TransactionClient, 'monetization'>,
  profile: { id: string; userId: string },
) {
  // One query at a time: inside a transaction there is one connection.
  const own = await db.monetization.findUnique({
    where: { profileId: profile.id },
    select: PAYOUT_ROW,
  });
  if (own?.stripeConnectAccountId && (own.userId || own.transfersEnabled)) {
    return own;
  }
  return db.monetization.findUnique({
    where: { userId: profile.userId },
    select: PAYOUT_ROW,
  });
}

// What is read of a Profile to know whether it may be paid.
export const PAYABLE_PROFILE_SELECT = {
  isAccountBanned: true,
  suspendedUntil: true,
  user: {
    select: {
      isActive: true,
      isRootBanned: true,
      deletedAt: true,
      identityVerifiedAt: true,
      dateOfBirth: true,
      dateOfBirthVerified: true,
    },
  },
} as const;

/**
 * Whether a person may charge: their identity is verified and they are
 * MONETIZATION_MIN_AGE or older by the date of birth read from the verified
 * document. A date only typed at sign-up, or none, does not let them charge.
 */
export function isOfChargingAge(user: {
  identityVerifiedAt: Date | null;
  dateOfBirth: Date | null;
  dateOfBirthVerified: boolean;
}): boolean {
  return (
    !!user.identityVerifiedAt &&
    user.dateOfBirthVerified &&
    !!user.dateOfBirth &&
    ageOn(user.dateOfBirth) >= MONETIZATION_MIN_AGE
  );
}

/**
 * Refuses, with a reason the app explains, a person who may not charge
 * because of their age or an identity not verified: asked when they set up
 * payouts or put a price on something.
 */
export async function assertOfChargingAge(
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
      ErrorCode.MONETIZATION_UNDER_AGE,
      `Only people ${MONETIZATION_MIN_AGE} or older, with a verified identity, can charge.`,
      { minAge: MONETIZATION_MIN_AGE },
    );
  }
}

/**
 * Whether a Profile may be paid: neither it nor its person is banned or
 * suspended, its person is still here, and its person is of charging age.
 */
export function canBePaid(profile: {
  isAccountBanned: boolean;
  suspendedUntil: Date | null;
  user: {
    isActive: boolean;
    isRootBanned: boolean;
    deletedAt: Date | null;
    identityVerifiedAt: Date | null;
    dateOfBirth: Date | null;
    dateOfBirthVerified: boolean;
  };
}): boolean {
  return (
    !profile.isAccountBanned &&
    !(profile.suspendedUntil && profile.suspendedUntil > new Date()) &&
    profile.user.isActive &&
    !profile.user.isRootBanned &&
    !profile.user.deletedAt &&
    isOfChargingAge(profile.user)
  );
}

/**
 * The payout row a payment to a Profile is sent to. A Profile that may not
 * be paid is not found, as everywhere else, and nothing is charged for it.
 */
export async function payoutDestinationFor(
  db: Pick<Prisma.TransactionClient, 'monetization' | 'profile'>,
  profile: { id: string; userId: string },
) {
  const seller = await db.profile.findUnique({
    where: { id: profile.id },
    select: PAYABLE_PROFILE_SELECT,
  });
  if (!seller || !canBePaid(seller)) {
    throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'Creator not found');
  }
  return payoutRowForProfile(db, profile);
}

/**
 * The creator's account a sale is charged on: one that takes card payments.
 * A creator with no account, or one that does not take them yet, sells
 * nothing, and the provider is not asked.
 */
export function accountTakingPayments(
  payout: {
    stripeConnectAccountId: string | null;
    chargesEnabled: boolean;
  } | null,
): string {
  if (!payout?.stripeConnectAccountId || !payout.chargesEnabled) {
    throw AppException.BadRequest(
      ErrorCode.CREATOR_STRIPE_NOT_SETUP,
      'Creator cannot take payments yet',
    );
  }
  return payout.stripeConnectAccountId;
}
