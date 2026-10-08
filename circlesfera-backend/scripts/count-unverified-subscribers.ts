import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

// Counts the platform subscriptions in force, per plan, whose holder has not
// verified their identity. It only reads and prints numbers: no email, name
// or identifier leaves the database. Runs with plain Node inside the
// production image, through the "Ops — count unverified subscribers" workflow.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const inForce = { status: { in: ['ACTIVE', 'TRIALING'] } } as const;
    const plans = await prisma.platformPlan.findMany({
      select: { id: true, name: true },
      orderBy: { priceCents: 'asc' },
    });

    let totalUnverified = 0;
    for (const plan of plans) {
      const ofPlan = { ...inForce, planId: plan.id };
      const [total, unverified, unverifiedEnding] = await Promise.all([
        prisma.platformSubscription.count({ where: ofPlan }),
        prisma.platformSubscription.count({
          where: { ...ofPlan, user: { identityVerifiedAt: null } },
        }),
        prisma.platformSubscription.count({
          where: {
            ...ofPlan,
            cancelAtPeriodEnd: true,
            user: { identityVerifiedAt: null },
          },
        }),
      ]);
      totalUnverified += unverified;
      console.log(
        `${plan.name}: ${total} in force, ${unverified} without verified identity ` +
          `(${unverifiedEnding} of them already ending at period end)`,
      );
    }

    // A subscription kept for tax records after its account was deleted.
    const withoutHolder = await prisma.platformSubscription.count({
      where: { ...inForce, userId: null },
    });
    console.log(`In force with no account behind: ${withoutHolder}`);
    console.log(`Total without verified identity: ${totalUnverified}`);
    console.log('Read only: nothing was changed.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
