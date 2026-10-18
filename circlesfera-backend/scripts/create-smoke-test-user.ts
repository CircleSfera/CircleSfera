/**
 * Creates (or resets) the account the signed-in smoke check of an
 * environment that is not production uses (scripts/smoke-signed-in.sh). The
 * deploy of the environment runs it on every deploy, with a new random
 * password, before scripts/create-smoke-fixtures.ts:
 *   SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... node scripts/create-smoke-test-user.ts
 *
 * This account is intentionally low-privilege (PERSONAL, private).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import pkg from 'pg';

const { Pool } = pkg;

async function main() {
  // From the environment, so the password is on no command line.
  const email = process.env.SMOKE_TEST_EMAIL;
  const password = process.env.SMOKE_TEST_PASSWORD;
  const username = 'circlesfera_smoke_test';

  if (!email || !password) {
    console.error('SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD must be set.');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Password must be at least 12 characters');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await argon2.hash(password);

    // The account, its sign-in (with the credentials) and its Profile; run
    // again, it only sets the password and the verified email again.
    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.signIn.findUnique({
        where: { email },
        select: { id: true, userId: true },
      });
      if (existing) {
        await tx.signIn.update({
          where: { id: existing.id },
          data: { password: passwordHash, emailVerified: new Date() },
        });
        return tx.user.findUniqueOrThrow({
          where: { id: existing.userId },
          include: { profiles: true },
        });
      }
      const account = await tx.user.create({
        data: {
          email,
          role: 'USER',
          settings: { create: { privacyLevel: 'PRIVATE' } },
        },
      });
      const signIn = await tx.signIn.create({
        data: {
          userId: account.id,
          email,
          password: passwordHash,
          emailVerified: new Date(),
        },
      });
      const profile = await tx.profile.create({
        data: {
          userId: account.id,
          signInId: signIn.id,
          username,
          fullName: 'CircleSfera Smoke Test',
          bio: 'Internal infrastructure account used by the post-deploy authenticated smoke check. Not a real user.',
        },
      });
      return { ...account, profiles: [profile] };
    });

    console.log('Smoke test account ready');
    console.log(`  userId:   ${user.id}`);
    console.log(`  email:    ${user.email}`);
    console.log(`  username: ${user.profiles[0]?.username ?? username}`);
  } catch (err) {
    console.error('create-smoke-test-user failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
