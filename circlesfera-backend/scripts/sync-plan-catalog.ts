import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
import Stripe from 'stripe';
import {
  findProviderProduct,
  findStoredPlan,
  PLAN_CATALOG,
  type ProviderPrice,
  type ProviderProduct,
  planPrice,
  planUpdate,
  priceProblems,
  type StoredPlan,
} from './plan-catalog.ts';

const { Pool } = pkg;

// Sets the stored platform plans to the catalog: their names, prices, what
// they include and the product and price of each in this environment's own
// payment provider account (live in production, test in staging), so an
// environment never names another's prices. A plan missing in the database
// is added. It prints what would change and changes nothing unless APPLY=1.
// Subscriptions are never touched. Runs with plain Node inside the backend
// image: in staging after each deploy, in production through the
// "Ops — sync plan catalog" workflow.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');
  const apply = process.env.APPLY === '1';

  const stripe = new Stripe(secretKey);
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const problems: string[] = [];

  try {
    console.log(
      `Payment provider: ${secretKey.includes('_live_') ? 'live' : 'test'} account`,
    );
    const products: ProviderProduct[] = [];
    for await (const product of stripe.products.list({
      active: true,
      limit: 100,
      expand: ['data.default_price'],
    })) {
      products.push(product as unknown as ProviderProduct);
    }
    const stored: StoredPlan[] = await prisma.platformPlan.findMany();

    for (const plan of PLAN_CATALOG) {
      const found = findProviderProduct(products, plan);
      if (!found.product) {
        problems.push(found.problem as string);
        continue;
      }
      const product = found.product;
      const activePrices: ProviderPrice[] = [];
      for await (const price of stripe.prices.list({
        product: product.id,
        active: true,
        limit: 100,
      })) {
        activePrices.push(price as unknown as ProviderPrice);
      }
      const price = planPrice(product, activePrices);
      const wrong = priceProblems(price, plan);
      if (wrong.length > 0) {
        problems.push(...wrong);
        continue;
      }
      const priceId = (price as ProviderPrice).id;
      const activePriceIds = activePrices.map((active) => active.id);

      const row = findStoredPlan(stored, plan, product.id);
      const update = planUpdate(row, plan, product.id, priceId, activePriceIds);
      if (!update) {
        console.log(`SAME ${plan.name}`);
        continue;
      }
      console.log(
        `${apply ? '' : 'WOULD '}${row ? `SET ${row.name}` : `ADD ${plan.name}`}: ${JSON.stringify(update)}`,
      );
      if (!apply) continue;
      if (row) {
        await prisma.platformPlan.update({
          where: { id: row.id },
          data: update,
        });
      } else {
        await prisma.platformPlan.create({
          data: update as Parameters<
            typeof prisma.platformPlan.create
          >[0]['data'],
        });
      }
    }

    for (const problem of problems) console.log(`PROBLEM ${problem}`);
    console.log(apply ? 'Applied.' : 'Dry run: nothing was changed.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
  // A plan that could not be checked is left as it was, and the run fails
  // so that it is seen.
  if (problems.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
