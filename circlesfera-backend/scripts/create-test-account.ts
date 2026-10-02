import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import pkg from 'pg';

const { Pool } = pkg;

// Staff-only: create a Test Account (PD-006), or mark an existing account as
// one. This script is the only way the mark is ever set; there is no way to
// clear it, because a Test Account never becomes a real account.
//
// Runs with plain Node inside the production image:
//   TEST_ACCOUNT_PASSWORD=... node scripts/create-test-account.ts <email> <username>
//   node scripts/create-test-account.ts <email> --mark-existing
//
// The password comes from the environment, not argv, so it does not show up in
// the process list or shell history. DATABASE_URL must be set.
async function main() {
  const args = process.argv.slice(2);
  const markExisting = args.includes('--mark-existing');
  const [email, username] = args.filter((a) => !a.startsWith('--'));
  if (!email || (!markExisting && !username)) {
    throw new Error(
      'Usage: create-test-account.ts <email> <username> | <email> --mark-existing',
    );
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isTestAccount: true },
    });

    if (markExisting) {
      if (!existing) throw new Error('No account with that email');
      if (existing.isTestAccount) {
        console.log('Already a Test Account. Nothing changed.');
        return;
      }
      // A marked account leaves the real audience entirely, so its ties to
      // real accounts are removed rather than left dangling across audiences.
      const profiles = await prisma.profile.findMany({
        where: { userId: existing.id },
        select: { id: true },
      });
      const profileIds = profiles.map((p) => p.id);
      const [follows] = await prisma.$transaction([
        prisma.follow.deleteMany({
          where: {
            OR: [
              { followerId: { in: profileIds } },
              { followingId: { in: profileIds } },
            ],
          },
        }),
        prisma.user.update({
          where: { id: existing.id },
          data: { isTestAccount: true },
        }),
      ]);
      console.log(
        `Marked as Test Account. Removed ${follows.count} follow relations.`,
      );
      return;
    }

    if (existing) {
      throw new Error(
        'An account with that email already exists. Use --mark-existing to mark it.',
      );
    }
    const password = process.env.TEST_ACCOUNT_PASSWORD;
    if (!password || password.length < 12) {
      throw new Error('TEST_ACCOUNT_PASSWORD must be set (12+ characters)');
    }

    await prisma.user.create({
      data: {
        email,
        password: await argon2.hash(password),
        role: 'USER',
        isTestAccount: true,
        emailVerified: new Date(),
        profiles: {
          create: { username, fullName: 'CircleSfera Test Account' },
        },
        settings: { create: { privacyLevel: 'PRIVATE' } },
      },
    });
    console.log('Test Account created.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
