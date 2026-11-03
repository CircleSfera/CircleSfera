import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../circlesfera-backend',
);

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(backendRoot, '.env');
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (match?.[1]) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  throw new Error('DATABASE_URL is required for global teardown.');
}

export default async function globalTeardown() {
  const require = createRequire(path.join(backendRoot, 'package.json'));
  const pg = require('pg') as any;
  const PoolCtor = pg.Pool ?? pg.default?.Pool;

  if (!PoolCtor) {
    console.warn('Could not load pg.Pool for teardown. Skipping cleanup.');
    return;
  }

  const pool = new PoolCtor({ connectionString: databaseUrl() });

  try {
    // Every account a test creates has an address on the reserved test
    // domain, whatever its prefix (e2e…, a scenario such as settings…):
    // see helpers/unique.ts and helpers/factories.ts. Seeded accounts use
    // @circlesfera.com and are never touched. Deleting the person removes
    // its Profiles, sign-ins and passkeys with it.
    const users = await pool.query(
      `DELETE FROM "users" WHERE email LIKE '%@circlesfera.test'`,
    );
    // Staff identities and roles a test created (helpers/staff.ts).
    const staff = await pool.query(
      `DELETE FROM "admin_identities" WHERE email LIKE '%@circlesfera.test'`,
    );
    const roles = await pool.query(
      `DELETE FROM "admin_roles" WHERE id LIKE 'arole_e2e_%'`,
    );
    console.log(
      `\n🧹 Cleaned up ${users.rowCount} test users, ${staff.rowCount} test staff identities and ${roles.rowCount} test staff roles.`,
    );
  } catch (err) {
    console.error('Error cleaning up E2E users:', err);
  } finally {
    await pool.end();
  }
}
