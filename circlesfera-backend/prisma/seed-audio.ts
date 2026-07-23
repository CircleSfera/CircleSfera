import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

/**
 * Seeds a small set of placeholder audio tracks for local/dev.
 * Production should use real CDN URLs managed via admin Audio tab.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed audio');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const tracks = [
    {
      title: 'Ambient Pulse',
      artist: 'CircleSfera',
      url: 'https://cdn.circlesfera.com/audio/ambient-pulse.mp3',
      duration: 30,
    },
    {
      title: 'Night Drive',
      artist: 'CircleSfera',
      url: 'https://cdn.circlesfera.com/audio/night-drive.mp3',
      duration: 45,
    },
    {
      title: 'Soft Focus',
      artist: 'CircleSfera',
      url: 'https://cdn.circlesfera.com/audio/soft-focus.mp3',
      duration: 28,
    },
  ];

  try {
    console.log('Seeding audio tracks...');
    for (const track of tracks) {
      const existing = await prisma.audio.findFirst({
        where: { title: track.title, artist: track.artist },
      });
      if (existing) {
        console.log(`  skip existing: ${track.title}`);
        continue;
      }
      await prisma.audio.create({ data: track });
      console.log(`  created: ${track.title}`);
    }
    console.log('Audio seeding complete.');
  } catch (err) {
    console.error('Error seeding audio:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
