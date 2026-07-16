import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import Stripe from 'stripe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.production to get the correct keys
const envPath = path.resolve(__dirname, '../../.env.production');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!stripeKey) {
  console.error('ERROR: STRIPE_SECRET_KEY is missing in environment.');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2026-03-25.dahlia' as any,
});

const PLANS = [
  {
    name: 'Premium',
    description:
      'Insignia de verificación, Analíticas básicas y Soporte prioritario.',
    price: 9.99,
  },
  {
    name: 'Elite Creator',
    description:
      'Herramientas Pro de crecimiento, Insights de audiencia y Spotlight.',
    price: 19.99,
  },
  {
    name: 'Business',
    description:
      'Verificación de negocio, Gestión multi-cuenta y Soporte 24/7 dedicado.',
    price: 49.99,
  },
];

async function main() {
  console.log('--- Starting Stripe Product Setup ---');

  for (const plan of PLANS) {
    console.log(`\nConfiguring ${plan.name}...`);

    // 1. Create Product in Stripe
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
    });
    console.log(`  [+] Created Product in Stripe: ${product.id}`);

    // 2. Create Price in Stripe (recurring monthly)
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(plan.price * 100), // in cents
      currency: 'eur',
      recurring: { interval: 'month' },
    });
    console.log(`  [+] Created Price in Stripe: ${price.id}`);

    console.log(
      `  [+] SQL COMMAND: UPDATE "PlatformPlan" SET "stripeProductId" = '${product.id}', "stripePriceId" = '${price.id}' WHERE name = '${plan.name}';`,
    );
  }

  console.log('\n--- Setup Complete! ---');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
