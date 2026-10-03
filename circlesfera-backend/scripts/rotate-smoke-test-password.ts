import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import pkg from 'pg';

const { Pool } = pkg;

// Sets a new password on the existing post-deploy smoke-test account and
// revokes its sessions. Reads SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD from
// the environment (never argv, never printed). Runs with plain Node inside the
// production image, normally through the "Ops — rotate smoke test password"
// workflow, which takes both values from the GitHub Actions secrets the deploy
// smoke check uses.
async function main() {
  const email = process.env.SMOKE_TEST_EMAIL;
  const password = process.env.SMOKE_TEST_PASSWORD;
  const connectionString = process.env.DATABASE_URL;
  if (!email || !password) {
    throw new Error('SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD must be set');
  }
  if (password.length < 24) {
    throw new Error('SMOKE_TEST_PASSWORD must be at least 24 characters');
  }
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const account = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!account) throw new Error('No account with SMOKE_TEST_EMAIL');

    const [, sessions] = await prisma.$transaction([
      prisma.user.update({
        where: { id: account.id },
        data: {
          password: await argon2.hash(password),
          passwordResetRequiredAt: null,
          resetToken: null,
          resetTokenExpires: null,
        },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: account.id } }),
    ]);
    console.log(
      `Smoke-test account password rotated. Revoked ${sessions.count} sessions.`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
