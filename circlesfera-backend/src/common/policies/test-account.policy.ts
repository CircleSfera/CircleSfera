import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Test Account policy (PD-006): Test Accounts and real accounts are two
// separate audiences. A viewer only ever sees, and acts on, Profiles of their
// own audience. Anonymous viewers belong to the real audience. Callers must
// answer a cross-audience lookup as if the target did not exist (NotFound,
// never Forbidden) so the existence of a Test Account is never revealed.

type Viewer = { isTestAccount?: boolean } | null | undefined;

type AudienceReader = Pick<Prisma.TransactionClient, 'profile'>;

export function isTestViewer(viewer: Viewer): boolean {
  return viewer?.isTestAccount === true;
}

// Prisma `Profile` filter keeping only Profiles of the viewer's audience.
export function sameAudienceProfileWhere(
  viewer: Viewer,
): Prisma.ProfileWhereInput {
  return { user: { isTestAccount: isTestViewer(viewer) } };
}

// Raw SQL condition for queries that join the users table. `usersAlias` must
// be a trusted identifier written in code, never request input.
export function sameAudienceSql(
  viewer: Viewer,
  usersAlias: string,
): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(`"${usersAlias}"`)}."isTestAccount" = ${isTestViewer(viewer)}`;
}

// True when the Profile exists and belongs to the viewer's audience.
export async function isSameAudience(
  db: AudienceReader,
  viewer: Viewer,
  profileId: string,
): Promise<boolean> {
  const profile = await db.profile.findFirst({
    where: { id: profileId, ...sameAudienceProfileWhere(viewer) },
    select: { id: true },
  });
  return Boolean(profile);
}

export async function assertSameAudience(
  db: AudienceReader,
  viewer: Viewer,
  profileId: string,
): Promise<void> {
  if (!(await isSameAudience(db, viewer, profileId))) {
    throw new NotFoundException('Profile not found');
  }
}
