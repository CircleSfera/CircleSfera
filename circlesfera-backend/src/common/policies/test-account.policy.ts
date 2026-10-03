import { ApiErrorCode } from '@circlesfera/shared';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Test Account policy: Test Accounts and real accounts are two
// separate audiences. A viewer only ever sees, and acts on, Profiles of their
// own audience. Anonymous viewers belong to the real audience. Callers must
// answer a cross-audience lookup as if the target did not exist (NotFound,
// never Forbidden) so the existence of a Test Account is never revealed.

type Viewer = { isTestAccount?: boolean } | null | undefined;

type AudienceReader = Pick<Prisma.TransactionClient, 'profile' | 'user'>;

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

// Audience (true = Test Account) of each existing Profile id given. Reads
// through the account (User) because the mark lives there.
export async function profileAudiences(
  db: AudienceReader,
  profileIds: Array<string | null | undefined>,
): Promise<Map<string, boolean>> {
  const ids = [...new Set(profileIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const accounts = await db.user.findMany({
    where: { profiles: { some: { id: { in: ids } } } },
    select: {
      isTestAccount: true,
      profiles: { where: { id: { in: ids } }, select: { id: true } },
    },
  });
  const audiences = new Map<string, boolean>();
  for (const account of accounts) {
    for (const profile of account.profiles) {
      audiences.set(profile.id, account.isTestAccount);
    }
  }
  return audiences;
}

// Prisma `Profile` filter for the audience of a viewer Profile (anonymous
// viewers: real accounts). Unlike sameAudienceProfileWhere, it resolves the
// viewer's audience from the database, for services that only hold a Profile id.
export async function viewerAudienceWhere(
  db: AudienceReader,
  viewerProfileId: string | null | undefined,
): Promise<Prisma.ProfileWhereInput> {
  return {
    user: { isTestAccount: await isTestViewerProfile(db, viewerProfileId) },
  };
}

// Audience of a viewer Profile; anonymous viewers are real (false).
export async function isTestViewerProfile(
  db: AudienceReader,
  viewerProfileId: string | null | undefined,
): Promise<boolean> {
  if (!viewerProfileId) return false;
  return (
    (await profileAudiences(db, [viewerProfileId])).get(viewerProfileId) ??
    false
  );
}

// Keeps the items whose Profile is in the same audience as the viewer
// Profile (anonymous viewers belong to the real audience). For lists built
// once and shared across viewers, e.g. cached rankings.
export async function filterToViewerAudience<T>(
  db: AudienceReader,
  viewerProfileId: string | null | undefined,
  items: T[],
  profileIdOf: (item: T) => string,
): Promise<T[]> {
  if (items.length === 0) return items;
  const audiences = await profileAudiences(db, [
    viewerProfileId,
    ...items.map(profileIdOf),
  ]);
  const viewerIsTest = viewerProfileId
    ? (audiences.get(viewerProfileId) ?? false)
    : false;
  return items.filter(
    (item) => (audiences.get(profileIdOf(item)) ?? false) === viewerIsTest,
  );
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

// Test Accounts never move real money: they cannot pay, and since
// they cannot onboard a payout account they cannot be paid either. Call with
// the paying (or onboarding) account before any payment provider request.
export async function assertRealMoneyAllowed(
  db: Pick<Prisma.TransactionClient, 'user'>,
  userId: string,
): Promise<void> {
  const account = await db.user.findUnique({
    where: { id: userId },
    select: { isTestAccount: true },
  });
  if (account?.isTestAccount) {
    throw new ForbiddenException(ApiErrorCode.TEST_ACCOUNT_NO_REAL_MONEY);
  }
}
