import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../circlesfera-backend',
);

type PoolLike = {
  query: (sql: string, params: string[]) => Promise<unknown>;
  end: () => Promise<void>;
};

export function backendApiUrl(): string {
  return (process.env.BACKEND_URL || 'http://localhost:3000/api/v1').replace(
    /\/$/,
    '',
  );
}

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(backendRoot, '.env');
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (match?.[1]) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  throw new Error(
    'DATABASE_URL is required to mark Playwright users as email-verified (set it or put it in circlesfera-backend/.env).',
  );
}

/**
 * EmailVerifiedGuard is on by default. Mail is not captured in CI, so journeys
 * that create posts/messages confirm the address in the same Postgres the API uses.
 * Same idea as backend e2e (`verificationToken` from Prisma) — no Nest stub.
 */
export async function markEmailVerified(email: string): Promise<void> {
  const require = createRequire(path.join(backendRoot, 'package.json'));
  const pg = require('pg') as {
    Pool?: new (opts: { connectionString: string }) => PoolLike;
    default?: { Pool: new (opts: { connectionString: string }) => PoolLike };
  };
  const PoolCtor = pg.Pool ?? pg.default?.Pool;
  if (!PoolCtor) {
    throw new Error('Could not load pg.Pool from circlesfera-backend');
  }
  const pool = new PoolCtor({ connectionString: databaseUrl() });
  try {
    const result = (await pool.query(
      `UPDATE "users" SET "emailVerified" = NOW(), "verificationToken" = NULL WHERE lower(email) = lower($1)`,
      [email],
    )) as { rowCount?: number | null };
    if (!result.rowCount) {
      throw new Error(`No users row updated for ${email}`);
    }
  } finally {
    await pool.end();
  }
}
