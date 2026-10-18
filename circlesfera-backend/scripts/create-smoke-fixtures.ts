import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import pkg from 'pg';

const { Pool } = pkg;

// The data the signed-in smoke check of an environment that is not
// production needs to prove what a signed-in person must not see or reach
// (scripts/smoke-signed-in.sh). Run again, it puts everything back as it
// should be and changes nothing else. Production keeps none of it.
//
// Everything here is a Test Account, so no real participant ever sees it,
// and the smoke account itself is marked as one so that it sees them. A Test
// Account never becomes a real account again.
//
// The deploy of the environment runs it with plain Node inside the image,
// after scripts/create-smoke-test-user.ts:
//   SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... node scripts/create-smoke-fixtures.ts
//
// With SMOKE_TEST_PASSWORD, the banned fixture signs in with the smoke
// password, so that the smoke check can see the answer a banned person gets.
// The other fixtures keep a random password nobody knows.
//
// The fixed identifiers below are the ones scripts/smoke-signed-in.sh uses.
export const SMOKE_FIXTURES = {
  bannedProfileId: '5e0c5e0c-0000-4000-8000-0000000000b1',
  privateProfileId: '5e0c5e0c-0000-4000-8000-0000000000b2',
  publicProfileId: '5e0c5e0c-0000-4000-8000-0000000000b3',
  privatePostId: '5e0c5e0c-0000-4000-8000-0000000000c1',
  maturePostId: '5e0c5e0c-0000-4000-8000-0000000000c2',
  generalPostId: '5e0c5e0c-0000-4000-8000-0000000000c3',
};

const ACCOUNTS = [
  {
    email: 'smoke-fixture-banned@example.invalid',
    username: 'cs_smoke_banned',
    profileId: SMOKE_FIXTURES.bannedProfileId,
    privacyLevel: 'PUBLIC',
    banned: true,
  },
  {
    email: 'smoke-fixture-private@example.invalid',
    username: 'cs_smoke_private',
    profileId: SMOKE_FIXTURES.privateProfileId,
    privacyLevel: 'PRIVATE',
    banned: false,
  },
  {
    email: 'smoke-fixture-public@example.invalid',
    username: 'cs_smoke_public',
    profileId: SMOKE_FIXTURES.publicProfileId,
    privacyLevel: 'PUBLIC',
    banned: false,
  },
] as const;

const POSTS = [
  {
    id: SMOKE_FIXTURES.privatePostId,
    profileId: SMOKE_FIXTURES.privateProfileId,
    caption:
      'cssmokeprivatefixture: only followers of a private profile see it',
    contentRating: 'GENERAL',
  },
  {
    id: SMOKE_FIXTURES.maturePostId,
    profileId: SMOKE_FIXTURES.publicProfileId,
    caption: 'cssmokematurefixture: hidden from a General preference',
    contentRating: 'MATURE',
  },
  {
    id: SMOKE_FIXTURES.generalPostId,
    profileId: SMOKE_FIXTURES.publicProfileId,
    caption: 'cssmokegeneralfixture: shown to everyone in the test audience',
    contentRating: 'GENERAL',
  },
] as const;

async function main() {
  const smokeEmail = process.env.SMOKE_TEST_EMAIL;
  if (!smokeEmail) throw new Error('SMOKE_TEST_EMAIL is not set');
  const smokePassword = process.env.SMOKE_TEST_PASSWORD;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // The smoke account joins the test audience, with the General content
    // preference the checks rely on. Its ties to real accounts are removed,
    // as for any account marked as a Test Account.
    const smoke = await prisma.signIn.findUnique({
      where: { email: smokeEmail },
      select: { user: { select: { id: true, isTestAccount: true } } },
    });
    if (!smoke) throw new Error('No sign-in with the smoke test email');
    const smokeUserId = smoke.user.id;
    if (!smoke.user.isTestAccount) {
      const own = await prisma.profile.findMany({
        where: { userId: smokeUserId },
        select: { id: true },
      });
      const ids = own.map((p) => p.id);
      await prisma.$transaction([
        prisma.follow.deleteMany({
          where: {
            OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }],
          },
        }),
        prisma.user.update({
          where: { id: smokeUserId },
          data: { isTestAccount: true },
        }),
      ]);
      console.log('The smoke account is now a Test Account.');
    }
    await prisma.userSettings.upsert({
      where: { userId: smokeUserId },
      create: { userId: smokeUserId, contentPreference: 'GENERAL' },
      update: { contentPreference: 'GENERAL' },
    });

    for (const fixture of ACCOUNTS) {
      // Nobody signs in to these accounts: the password is random and
      // never kept.
      const unusable = await argon2.hash(randomBytes(32).toString('hex'));
      const known =
        fixture.banned && smokePassword
          ? await argon2.hash(smokePassword)
          : undefined;
      await prisma.$transaction(async (tx) => {
        let signIn = await tx.signIn.findUnique({
          where: { email: fixture.email },
          select: { id: true, userId: true },
        });
        if (!signIn) {
          const account = await tx.user.create({
            data: { email: fixture.email, role: 'USER', isTestAccount: true },
          });
          signIn = await tx.signIn.create({
            data: {
              userId: account.id,
              email: fixture.email,
              password: unusable,
              emailVerified: new Date(),
            },
            select: { id: true, userId: true },
          });
        }
        await tx.user.update({
          where: { id: signIn.userId },
          data: { isTestAccount: true, isActive: true, deactivatedAt: null },
        });
        if (known) {
          await tx.signIn.update({
            where: { id: signIn.id },
            data: { password: known },
          });
        }
        const state = {
          username: fixture.username,
          fullName: 'CircleSfera smoke check',
          privacyLevel: fixture.privacyLevel,
          isAccountBanned: fixture.banned,
          suspendedUntil: null,
        };
        await tx.profile.upsert({
          where: { id: fixture.profileId },
          create: {
            id: fixture.profileId,
            userId: signIn.userId,
            signInId: signIn.id,
            ...state,
          },
          update: state,
        });
      });
    }

    for (const post of POSTS) {
      const state = {
        caption: post.caption,
        contentRating: post.contentRating,
        visibility: 'PUBLIC',
        moderationStatus: 'VISIBLE',
        scheduledStatus: 'PUBLISHED',
        isPremium: false,
      } as const;
      await prisma.post.upsert({
        where: { id: post.id },
        create: { id: post.id, profileId: post.profileId, ...state },
        update: state,
      });
    }

    // The smoke account follows none of them, so the private post stays
    // out of its reach.
    const smokeProfiles = await prisma.profile.findMany({
      where: { userId: smokeUserId },
      select: { id: true },
    });
    await prisma.follow.deleteMany({
      where: {
        followerId: { in: smokeProfiles.map((p) => p.id) },
        followingId: { in: ACCOUNTS.map((a) => a.profileId) },
      },
    });

    console.log('Smoke fixtures are in place.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
