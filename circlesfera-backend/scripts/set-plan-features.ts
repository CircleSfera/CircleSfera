import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

// What each platform plan includes today, limited to what the product
// really does. A benefit is added here when it is built, not before.
// `verified_badge` is also the key the profile reads to show the badge.
const PLANS = [
  {
    // The €9.99 plan is named Premium; "Verified" is its former name.
    match: ['premium', 'verified'],
    description: 'Verified badge.',
    features: ['verified_badge'],
  },
  {
    match: ['elite'],
    description: 'Elite badge and a feed without promoted posts.',
    features: ['verified_badge', 'no_promoted_content'],
  },
  {
    match: ['business'],
    description: 'Business badge and a feed without promoted posts.',
    features: ['verified_badge', 'no_promoted_content'],
  },
] as const;

// Sets the stored description and feature list of the three platform plans.
// It prints what would change and changes nothing unless APPLY=1. Prices,
// Stripe identifiers and subscriptions are never touched. Runs with plain
// Node inside the production image, through the "Ops — set plan features"
// workflow.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const apply = process.env.APPLY === '1';

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const stored = await prisma.platformPlan.findMany({
      select: { id: true, name: true, description: true, features: true },
      orderBy: { priceCents: 'asc' },
    });

    for (const plan of stored) {
      const name = plan.name.toLowerCase();
      const target = PLANS.find((candidate) =>
        candidate.match.some((word) => name.includes(word)),
      );
      if (!target) {
        console.log(`SKIP ${plan.name}: not one of the three known plans`);
        continue;
      }
      const same =
        plan.description === target.description &&
        plan.features.join(',') === target.features.join(',');
      console.log(
        `${same ? 'SAME' : apply ? 'SET ' : 'WOULD SET'} ${plan.name}: ` +
          `[${plan.features.join(', ')}] -> [${target.features.join(', ')}]`,
      );
      if (same || !apply) continue;
      await prisma.platformPlan.update({
        where: { id: plan.id },
        data: {
          description: target.description,
          features: [...target.features],
        },
      });
    }
    console.log(apply ? 'Applied.' : 'Dry run: nothing was changed.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
