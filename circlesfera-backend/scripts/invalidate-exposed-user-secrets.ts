import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

// One-off remediation for the User-row exposure fixed in PRs #142/#143.
// Dry run by default: prints counts only (never values). With --apply it
// clears the one-time tokens that were exposed: password-reset tokens, email
// verification tokens and the legacy passkey challenge. Users simply request a
// new reset/verification email. Password hashes and 2FA secrets are only
// reported: invalidating them locks users out and needs a product decision.
async function main() {
  const apply = process.argv.includes('--apply');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const target = new URL(connectionString);
  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'} against ${target.hostname}:${target.port || '5432'}${target.pathname}`,
  );

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const [
      total,
      resetTokens,
      verificationTokens,
      challenges,
      argon2Hashes,
      bcryptHashes,
      twoFactorEnabled,
      twoFactorPlaintext,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { resetToken: { not: null } } }),
      prisma.user.count({ where: { verificationToken: { not: null } } }),
      prisma.user.count({ where: { currentChallenge: { not: null } } }),
      prisma.user.count({ where: { password: { startsWith: '$argon2' } } }),
      prisma.user.count({
        where: {
          OR: [
            { password: { startsWith: '$2a$' } },
            { password: { startsWith: '$2b$' } },
            { password: { startsWith: '$2y$' } },
          ],
        },
      }),
      prisma.user.count({ where: { isTwoFactorEnabled: true } }),
      prisma.user.count({
        where: {
          twoFactorSecret: { not: null },
          NOT: { twoFactorSecret: { contains: ':' } },
        },
      }),
    ]);

    console.log(
      JSON.stringify(
        {
          users: total,
          oneTimeTokens: { resetTokens, verificationTokens, challenges },
          reportOnly: {
            passwordHashes: {
              argon2: argon2Hashes,
              bcryptLegacy: bcryptHashes,
            },
            twoFactor: {
              enabled: twoFactorEnabled,
              plaintextSecrets: twoFactorPlaintext,
            },
          },
        },
        null,
        2,
      ),
    );

    if (!apply) {
      console.log(
        'Dry run only. Re-run with --apply to clear the one-time tokens.',
      );
      return;
    }

    const cleared = await prisma.user.updateMany({
      where: {
        OR: [
          { resetToken: { not: null } },
          { verificationToken: { not: null } },
          { currentChallenge: { not: null } },
        ],
      },
      data: {
        resetToken: null,
        resetTokenExpires: null,
        verificationToken: null,
        currentChallenge: null,
      },
    });
    console.log(`Cleared one-time tokens on ${cleared.count} users.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
