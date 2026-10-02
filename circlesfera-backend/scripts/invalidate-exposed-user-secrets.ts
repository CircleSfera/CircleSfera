import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

// Runs with plain Node (no tsx, no dotenv) so it works inside the production
// image: `node scripts/invalidate-exposed-user-secrets.ts`. DATABASE_URL must
// already be in the environment (locally: `node --env-file=.env ...`).
//
// One-off remediation for the User-row exposure fixed in PRs #142/#143.
// Dry run by default: prints counts only (never values). With --apply it
// clears the one-time tokens that were exposed: password-reset tokens, email
// verification tokens and the legacy passkey challenge. Users simply request a
// new reset/verification email.
//
// --force-password-reset --exposed-before=<ISO date> additionally, for accounts
// created before that instant (the moment the fix reached production): requires
// an email password reset before the next password login, revokes every
// session, and turns off 2FA whose secret was stored in plaintext (the secret
// is known to anyone who read it; the user re-enrols after resetting).
// Encrypted 2FA secrets are left alone: only ciphertext was exposed.
// --exclude-email=<email> (repeatable) keeps an account out of the forced
// reset, e.g. the post-deploy smoke-test account, whose login must keep working.
function parseExposedBefore(): Date | null {
  const arg = process.argv.find((a) => a.startsWith('--exposed-before='));
  if (!arg) return null;
  const date = new Date(arg.slice('--exposed-before='.length));
  if (Number.isNaN(date.getTime())) {
    throw new Error('--exposed-before must be an ISO date');
  }
  if (date > new Date()) throw new Error('--exposed-before is in the future');
  return date;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const forceReset = process.argv.includes('--force-password-reset');
  const exposedBefore = parseExposedBefore();
  const excludedEmails = process.argv
    .filter((a) => a.startsWith('--exclude-email='))
    .map((a) => a.slice('--exclude-email='.length));
  if (forceReset && !exposedBefore) {
    throw new Error(
      '--force-password-reset requires --exposed-before=<ISO date>',
    );
  }
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

    const exposedWhere = exposedBefore
      ? {
          createdAt: { lt: exposedBefore },
          email: { notIn: excludedEmails },
        }
      : null;
    const excludedFound = await prisma.user.count({
      where: { email: { in: excludedEmails } },
    });
    if (excludedFound !== excludedEmails.length) {
      throw new Error(
        `--exclude-email: ${excludedEmails.length} given, ${excludedFound} found. Check the addresses.`,
      );
    }
    const plaintextTwoFactorWhere = {
      twoFactorSecret: { not: null },
      NOT: { twoFactorSecret: { contains: ':' } },
    };
    const forcedReset = exposedWhere
      ? {
          exposedBefore: exposedBefore?.toISOString(),
          excludedAccounts: excludedFound,
          accountsToFlag: await prisma.user.count({
            where: { ...exposedWhere, passwordResetRequiredAt: null },
          }),
          alreadyFlagged: await prisma.user.count({
            where: { passwordResetRequiredAt: { not: null } },
          }),
          sessionsToRevoke: await prisma.refreshToken.count({
            where: { user: exposedWhere },
          }),
          plaintextTwoFactorToDisable: await prisma.user.count({
            where: { ...exposedWhere, ...plaintextTwoFactorWhere },
          }),
        }
      : undefined;

    console.log(
      JSON.stringify(
        {
          users: total,
          forcedReset,
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

    if (!forceReset || !exposedWhere) {
      console.log(
        'Password reset not forced. Add --force-password-reset --exposed-before=<ISO date> to do so.',
      );
      return;
    }

    const [flagged, sessions, twoFactor] = await prisma.$transaction([
      prisma.user.updateMany({
        where: { ...exposedWhere, passwordResetRequiredAt: null },
        data: { passwordResetRequiredAt: new Date() },
      }),
      prisma.refreshToken.deleteMany({ where: { user: exposedWhere } }),
      prisma.user.updateMany({
        where: { ...exposedWhere, ...plaintextTwoFactorWhere },
        data: { isTwoFactorEnabled: false, twoFactorSecret: null },
      }),
    ]);
    console.log(
      `Required a password reset on ${flagged.count} users, revoked ${sessions.count} sessions, disabled plaintext 2FA on ${twoFactor.count} users.`,
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
