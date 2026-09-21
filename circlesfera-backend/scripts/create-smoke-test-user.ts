/**
 * One-time setup: create (or reset) the dedicated account used by the
 * post-deploy authenticated smoke check (see .github/workflows/deploy.yml).
 *
 * This account is intentionally low-privilege (PERSONAL, private) — the
 * smoke check only needs to log in and create/delete one PRIVATE post.
 *
 * Usage (run once against the target DATABASE_URL, e.g. production):
 *   DATABASE_URL=<prod-url> npx tsx scripts/create-smoke-test-user.ts <email> <password> [username]
 *
 * After running, store the email/password as GitHub Actions secrets:
 *   SMOKE_TEST_EMAIL, SMOKE_TEST_PASSWORD
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import pkg from 'pg';

const { Pool } = pkg;

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const username = process.argv[4] || 'circlesfera_smoke_test';

  if (!email || !password) {
    console.error(
      'Usage: npx tsx scripts/create-smoke-test-user.ts <email> <password> [username]',
    );
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

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        password: passwordHash,
        role: 'USER',
        emailVerified: new Date(),
        profiles: {
          create: {
            username,
            fullName: 'CircleSfera Smoke Test',
            bio: 'Internal infrastructure account used by the post-deploy authenticated smoke check. Not a real user.',
          },
        },
        settings: {
          create: { privacyLevel: 'PRIVATE' },
        },
      },
      update: {
        password: passwordHash,
        emailVerified: new Date(),
      },
      include: { profiles: true },
    });

    console.log('Smoke test account ready');
    console.log(`  userId:   ${user.id}`);
    console.log(`  email:    ${user.email}`);
    console.log(`  username: ${user.profiles[0]?.username ?? username}`);
    console.log('');
    console.log(
      'Next: store this email/password as GitHub Actions secrets SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD.',
    );
  } catch (err) {
    console.error('create-smoke-test-user failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
