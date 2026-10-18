import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

// Staff-only: production keeps no smoke accounts. The signed-in smoke check
// runs on staging, with staging's own accounts (scripts/smoke-signed-in.sh),
// so the accounts it used in production are deleted: the smoke account and
// the three fixtures of scripts/create-smoke-fixtures.ts.
//
// Each one is made inactive and its deletion is asked for at once through
// the outbox, the way a person's own deletion is, so the queue deletes it
// with all it holds (Profiles, posts, files) without waiting for the daily
// purge. Only Test Accounts with these emails are
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
      // The deletion itself, asked for now through the outbox, as a person's
      // own deletion is: the account, its Profiles, posts and files go once
      // the queue runs it, without waiting for the daily purge.
      const asked = await prisma.outboxEvent.count({
        where: {
          queueName: 'users-processing',
          eventName: 'hard-delete-user',
          payload: { path: ['userId'], equals: user.id },
        },
      });
      const scheduled =
        user.scheduledDeletionAt !== null && user.scheduledDeletionAt <= now;
      if (scheduled && asked > 0) {
        console.log(`SAME  ${email} (${names}): deletion already asked for`);
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
        ...(asked > 0
          ? []
          : [
              prisma.outboxEvent.create({
                data: {
                  queueName: 'users-processing',
                  eventName: 'hard-delete-user',
                  payload: { userId: user.id },
                  options: {
                    jobId: `delete-${user.id}`,
                    removeOnComplete: true,
                    removeOnFail: false,
                  },
                  status: 'PENDING',
                },
              }),
            ]),
      ]);
    }
    console.log(
      apply
        ? 'Asked for: each account is deleted as soon as the queue runs it.'
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
