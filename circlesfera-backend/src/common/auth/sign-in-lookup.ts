import type { PrismaService } from '../../prisma/prisma.service.js';

/** Who is asking, as the session names them. */
export interface SessionOwner {
  userId: string;
  profileId?: string | null;
}

/**
 * Whether the email of the sign-in behind a session is verified. The sign-in
 * is the one of the Profile in use; when the session names no Profile, it is
 * the first sign-in of the account, which is the one every Profile gets by
 * default. False when there is none: a session without a sign-in is never
 * treated as verified.
 */
export async function sessionEmailVerified(
  prisma: PrismaService,
  owner: SessionOwner,
): Promise<boolean> {
  const signIn = await prisma.signIn.findFirst({
    where: {
      userId: owner.userId,
      ...(owner.profileId && { profiles: { some: { id: owner.profileId } } }),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { emailVerified: true },
  });
  return !!signIn?.emailVerified;
}
