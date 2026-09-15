/**
 * Delete Playwright accounts left in a shared/dev Postgres.
 *
 * Matches `e2e/helpers/unique.ts`: emails end with `@circlesfera.test`.
 * LiveStream.host has no onDelete Cascade — streams hosted by those profiles
 * are removed first so user delete can cascade posts/profiles.
 *
 * Usage (from repo root or backend, with DATABASE_URL pointing at the target DB):
 *
 *   # Dry-run (default)
 *   npm run e2e:cleanup
 *
 *   # Apply
 *   CONFIRM=YES npm run e2e:cleanup
 *
 * Never run against production.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

const E2E_EMAIL_SUFFIX = '@circlesfera.test';

function assertSafeTarget(databaseUrl: string): void {
  const lower = databaseUrl.toLowerCase();
  if (
    lower.includes('prod') ||
    lower.includes('circlesfera.com') ||
    lower.includes('amazonaws') ||
    lower.includes('neon.tech') ||
    lower.includes('supabase')
  ) {
    throw new Error(
      `Refusing to run against a URL that looks non-local: ${databaseUrl.replace(/:[^:@/]+@/, ':***@')}`,
    );
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  assertSafeTarget(connectionString);

  const confirm = process.env.CONFIRM === 'YES';
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const users = await prisma.user.findMany({
      where: { email: { endsWith: E2E_EMAIL_SUFFIX } },
      select: {
        id: true,
        email: true,
        profiles: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const profileIds = users.flatMap((u) => u.profiles.map((p) => p.id));
    const postCount =
      profileIds.length === 0
        ? 0
        : await prisma.post.count({
            where: { profileId: { in: profileIds } },
          });
    const liveHostCount =
      profileIds.length === 0
        ? 0
        : await prisma.liveStream.count({
            where: { hostId: { in: profileIds } },
          });

    console.log(
      JSON.stringify(
        {
          database: connectionString.replace(/:[^:@/]+@/, ':***@'),
          match: `email endsWith ${E2E_EMAIL_SUFFIX}`,
          users: users.length,
          posts: postCount,
          liveStreamsHosted: liveHostCount,
          sample: users.slice(0, 8).map((u) => ({
            email: u.email,
            usernames: u.profiles.map((p) => p.username),
          })),
          mode: confirm ? 'DELETE' : 'dry-run',
        },
        null,
        2,
      ),
    );

    if (users.length === 0) {
      console.log('Nothing to delete.');
      return;
    }

    if (!confirm) {
      console.log(
        'Dry-run only. Re-run with CONFIRM=YES to delete these users (and cascaded posts).',
      );
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (profileIds.length > 0) {
        await tx.liveStream.updateMany({
          where: { coHostId: { in: profileIds } },
          data: { coHostId: null },
        });
        await tx.liveStream.deleteMany({
          where: { hostId: { in: profileIds } },
        });
      }
      const result = await tx.user.deleteMany({
        where: { email: { endsWith: E2E_EMAIL_SUFFIX } },
      });
      console.log(`Deleted ${result.count} user(s).`);
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
