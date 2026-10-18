import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

// Staff-only: production keeps no smoke accounts. The signed-in smoke check
// runs on staging, with staging's own accounts (scripts/smoke-signed-in.sh),
// so the accounts it used in production are deleted: the smoke account and
// the three fixtures of scripts/create-smoke-fixtures.ts.
//
// Each one is scheduled for deletion now, the way a person deleting their
// account is, so the daily purge of expired accounts deletes it with all it
// holds (Profiles, posts, files). Only Test Accounts with these emails are
// touched. Prints what it would do and changes nothing unless APPLY=1. Runs
// with plain Node inside the production image, through the "Ops — delete
// smoke accounts" workflow.
const EMAILS = [
  'smoke-test@circlesfera.internal',
  'smoke-fixture-banned@example.invalid',
  'smoke-fixture-private@example.invalid',
  'smoke-fixture-public@example.invalid',
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const apply = process.env.APPLY === '1';

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const signIns = await prisma.signIn.findMany({
      where: { email: { in: EMAILS } },
      select: {
        email: true,
        user: {
          select: {
            id: true,
            isTestAccount: true,
            scheduledDeletionAt: true,
            profiles: { select: { username: true } },
          },
        },
      },
    });

    const now = new Date();
    for (const email of EMAILS) {
      const found = signIns.find((s) => s.email === email);
      if (!found) {
        console.log(`GONE  ${email}`);
        continue;
      }
      const { user } = found;
      const names = user.profiles.map((p) => `@${p.username}`).join(', ');
      if (!user.isTestAccount) {
        // Never a real account, whatever its email.
        console.log(`SKIP  ${email} (${names}): not a Test Account`);
        continue;
      }
      if (user.scheduledDeletionAt && user.scheduledDeletionAt <= now) {
        console.log(`SAME  ${email} (${names}): already scheduled`);
        continue;
      }
      console.log(`${apply ? 'DELETE' : 'WOULD DELETE'}  ${email} (${names})`);
      if (!apply) continue;
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { isActive: false, deletedAt: now, scheduledDeletionAt: now },
        }),
        prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      ]);
    }
    console.log(
      apply
        ? 'Scheduled: the daily purge of expired accounts deletes them.'
        : 'Dry run: nothing changed.',
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
