import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
import { seedFirstPartyAudio } from './first-party-audio.seed.js';

const { Pool } = pkg;

/**
 * CLI: `npm run prisma:seed:audio`
 * Also invoked from `prisma/seed.ts` for a non-empty create picker after full seed.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed audio');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await seedFirstPartyAudio(prisma);
  } catch (err) {
    console.error('Error seeding audio:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
