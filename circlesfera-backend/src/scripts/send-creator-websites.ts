/**
 * One-off: gives every payout account a Profile holds the address of that
 * Profile's public page (business_profile.url), which the payment provider
 * asks of every creator of a content platform. New accounts get it when
 * their creator opens their payout settings, and again on a new username;
 * this reaches the accounts opened before that.
 *
 * Only an account a Profile holds itself is given an address: one its
 * person shares with another Profile is not one page's.
 *
 * Dry run by default: it lists what it would send and sends nothing.
 *
 *   npx tsx src/scripts/send-creator-websites.ts
 *   CONFIRM=YES npx tsx src/scripts/send-creator-websites.ts
 *
 * Needs DATABASE_URL, STRIPE_SECRET_KEY and FRONTEND_URL. Writes to the
 * provider's live accounts when the key is a live one: run it only with the
 * owner's go-ahead.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
import { StripeService } from '../common/stripe/stripe.service.js';

async function main() {
  const apply = process.env.CONFIRM === 'YES';
  const pool = new pkg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const stripe = new StripeService({
    get: (key: string) => process.env[key],
  } as never);

  const rows = await prisma.monetization.findMany({
    where: { stripeConnectAccountId: { not: null }, profileId: { not: null } },
    select: {
      stripeConnectAccountId: true,
      profile: { select: { username: true } },
    },
  });

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const accountId = row.stripeConnectAccountId as string;
    const username = row.profile?.username;
    if (!username) continue;
    if (!apply) {
      console.log(`would send: ${accountId} -> /${username}`);
      continue;
    }
    try {
      await stripe.setCreatorWebsite(accountId, username);
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `not sent: ${accountId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  console.log(
    apply
      ? `Sent ${sent} of ${rows.length}; ${failed} failed.`
      : `Dry run: ${rows.length} accounts. Set CONFIRM=YES to send.`,
  );
  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
