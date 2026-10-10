import type { PrismaService } from '../../prisma/prisma.service.js';

/** Who is asking, as the session names them. */
export interface SessionOwner {
  userId: string;
  // The sign-in that opened the session, when the session names it.
  signInId?: string | null;
  profileId?: string | null;
}

// The first sign-in of an account: the one its Profiles share by default.
export const FIRST_SIGN_IN_ORDER = [
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
];

/** The sign-in a session means, always inside the account of the session. */
export function sessionSignInWhere(owner: SessionOwner) {
  return {
    userId: owner.userId,
    ...(owner.signInId
      ? { id: owner.signInId }
      : owner.profileId && { profiles: { some: { id: owner.profileId } } }),
  };
}

/**
 * Where an email about a Profile goes: the email of the sign-in of that
 * Profile once it is verified. Until then, the email of the first sign-in of
 * the account, so that a mistyped address never receives someone's notices.
 * Nothing when the Profile does not exist.
 */
export async function emailForProfile(
  prisma: PrismaService,
  profileId: string,
): Promise<string | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      userId: true,
      signIn: { select: { email: true, emailVerified: true } },
    },
  });
  if (!profile) return null;
  if (profile.signIn?.emailVerified) return profile.signIn.email;
  return emailForPerson(prisma, profile.userId);
}

/**
 * Where an email about the person goes (payments, data, the account): the
 * email of the first sign-in of the account.
 */
export async function emailForPerson(
  prisma: PrismaService,
  userId: string,
): Promise<string | null> {
  const first = await prisma.signIn.findFirst({
    where: { userId },
    orderBy: FIRST_SIGN_IN_ORDER,
    select: { email: true },
  });
  return first?.email ?? null;
}

/**
 * Whether the email of the sign-in behind a session is verified. The sign-in
 * is the one that opened the session; for a session that does not name it,
 * the one of the Profile in use, and failing that the first sign-in of the
 * account, which is the one every Profile gets by default. False when there
 * is none: a session without a sign-in is never treated as verified.
 */
export async function sessionEmailVerified(
  prisma: PrismaService,
  owner: SessionOwner,
): Promise<boolean> {
  const signIn = await prisma.signIn.findFirst({
    where: sessionSignInWhere(owner),
    orderBy: FIRST_SIGN_IN_ORDER,
    select: { emailVerified: true },
  });
  return !!signIn?.emailVerified;
}
