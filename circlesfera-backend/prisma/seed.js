import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import pkg from 'pg';

const { Pool } = pkg;
async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    console.log('Starting seed...');
    const defaultPassword = 'password123';
    const hashedPassword = await argon2.hash(defaultPassword);
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@circlesfera.com' },
      update: {},
      create: {
        email: 'admin@circlesfera.com',
        password: hashedPassword,
        role: 'ADMIN',
        profile: {
          create: {
            username: 'CircleSfera',
            fullName: 'CircleSfera',
          },
        },
      },
    });
    console.log(`Created admin user: ${adminUser.email}`);
    const regularUser = await prisma.user.upsert({
      where: { email: 'easyfeliu@gmail.com' },
      update: {},
      create: {
        email: 'easyfeliu@gmail.com',
        password: hashedPassword,
        role: 'USER',
        profile: {
          create: {
            username: 'EasyFeliu',
            fullName: 'Luis Feliu Gomez Polo',
          },
        },
      },
    });
    console.log(`Created user: ${regularUser.email}`);
    const premiumPlan = await prisma.platformPlan.upsert({
      where: { stripeProductId: 'prod_premium' },
      update: {
        name: 'Premium',
        description:
          'Insignia de verificación, Analíticas básicas y Soporte prioritario.',
        price: 9.99,
        currency: 'EUR',
      },
      create: {
        name: 'Premium',
        description:
          'Insignia de verificación, Analíticas básicas y Soporte prioritario.',
        price: 9.99,
        currency: 'EUR',
        interval: 'month',
        stripeProductId: 'prod_premium',
        stripePriceId: 'price_premium',
        features: ['verified_badge', 'basic_analytics', 'priority_support'],
      },
    });
    console.log(`Created platform plan: ${premiumPlan.name}`);
    const elitePlan = await prisma.platformPlan.upsert({
      where: { stripeProductId: 'prod_elite' },
      update: {
        name: 'Elite Creator',
        description:
          'Herramientas Pro de crecimiento, Insights de audiencia y Spotlight.',
        price: 19.99,
        currency: 'EUR',
      },
      create: {
        name: 'Elite Creator',
        description:
          'Herramientas Pro de crecimiento, Insights de audiencia y Spotlight.',
        price: 19.99,
        currency: 'EUR',
        interval: 'month',
        stripeProductId: 'prod_elite',
        stripePriceId: 'price_elite',
        features: [
          'pro_growth_tools',
          'audience_insights',
          'profile_spotlight',
          'verified_badge',
        ],
      },
    });
    console.log(`Created platform plan: ${elitePlan.name}`);
    const businessPlan = await prisma.platformPlan.upsert({
      where: { stripeProductId: 'prod_business' },
      update: {
        name: 'Business',
        description:
          'Verificación de negocio, Gestión multi-cuenta y Soporte 24/7 dedicado.',
        price: 49.99,
        currency: 'EUR',
      },
      create: {
        name: 'Business',
        description:
          'Verificación de negocio, Gestión multi-cuenta y Soporte 24/7 dedicado.',
        price: 49.99,
        currency: 'EUR',
        interval: 'month',
        stripeProductId: 'prod_business',
        stripePriceId: 'price_business',
        features: [
          'business_verification',
          'multi_account',
          'dedicated_support',
          'api_access_beta',
        ],
      },
    });
    console.log(`Created platform plan: ${businessPlan.name}`);
    console.log('Seed finished.');
  } catch (err) {
    console.error('Error seeding data:', err);
  } finally {
    await prisma.$disconnect();
  }
}
void main();
//# sourceMappingURL=seed.js.map
