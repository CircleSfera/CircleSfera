/**
 * Backfill missing post + profile embeddings.
 *
 * Usage:
 *   cd circlesfera-backend && npx tsx scripts/generate-embeddings.ts
 *   npx tsx scripts/generate-embeddings.ts --profiles-only
 *   npx tsx scripts/generate-embeddings.ts --posts-only
 *   npx tsx scripts/generate-embeddings.ts --limit=50
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import pkg from 'pg';

const { Pool } = pkg;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    profilesOnly: args.includes('--profiles-only'),
    postsOnly: args.includes('--posts-only'),
    limit: Number(
      args.find((a) => a.startsWith('--limit='))?.split('=')[1] || 200,
    ),
  };
}

function mockEmbedding(): number[] {
  return Array.from({ length: 1536 }, () => (Math.random() * 2 - 1) * 0.1);
}

async function generateEmbedding(
  openai: OpenAI | null,
  text: string,
): Promise<number[]> {
  const input = text.trim().slice(0, 8000);
  if (!input) return mockEmbedding();
  if (!openai) return mockEmbedding();

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input,
    encoding_format: 'float',
  });
  return response.data[0].embedding;
}

async function main() {
  const { profilesOnly, postsOnly, limit } = parseArgs();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const apiKey = process.env.OPENAI_API_KEY;
  const openai = apiKey ? new OpenAI({ apiKey }) : null;
  if (!openai) {
    console.warn('OPENAI_API_KEY missing — using mock embeddings (dev only).');
  }

  console.log('Starting embedding backfill...', {
    profilesOnly,
    postsOnly,
    limit,
  });

  try {
    if (!postsOnly) {
      const profiles = await prisma.$queryRaw<
        {
          id: string;
          username: string;
          fullName: string | null;
          bio: string | null;
        }[]
      >`
        SELECT p.id, p.username, p."fullName", p.bio
        FROM profiles p
        LEFT JOIN profile_embeddings pe ON pe."profileId" = p.id
        WHERE pe."profileId" IS NULL
        ORDER BY p."updatedAt" DESC
        LIMIT ${limit}
      `;

      console.log(`Profiles to embed: ${profiles.length}`);
      for (const profile of profiles) {
        const text = [profile.username, profile.fullName, profile.bio]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (!text) continue;
        const embedding = await generateEmbedding(openai, text);
        await prisma.$executeRaw`
          INSERT INTO profile_embeddings ("profileId", vector)
          VALUES (${profile.id}, ${JSON.stringify(embedding)}::vector)
          ON CONFLICT ("profileId")
          DO UPDATE SET vector = EXCLUDED.vector
        `;
        console.log(`  ✓ profile ${profile.username}`);
      }
    }

    if (!profilesOnly) {
      const posts = await prisma.$queryRaw<
        { id: string; caption: string | null }[]
      >`
        SELECT p.id, p.caption
        FROM posts p
        LEFT JOIN post_embeddings pe ON pe."postId" = p.id
        WHERE pe."postId" IS NULL
          AND p."moderationStatus" = 'VISIBLE'
          AND COALESCE(p.caption, '') <> ''
        ORDER BY p."createdAt" DESC
        LIMIT ${limit}
      `;

      console.log(`Posts to embed: ${posts.length}`);
      for (const post of posts) {
        const embedding = await generateEmbedding(openai, post.caption || '');
        await prisma.$executeRaw`
          INSERT INTO post_embeddings ("postId", vector)
          VALUES (${post.id}, ${JSON.stringify(embedding)}::vector)
          ON CONFLICT ("postId")
          DO UPDATE SET vector = EXCLUDED.vector
        `;
        console.log(`  ✓ post ${post.id}`);
      }
    }

    console.log('Backfill complete.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
