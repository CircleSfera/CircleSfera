import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext } from '@playwright/test';
import { registerViaApi } from './session.js';
import { uniqueAccount, uniqueSuffix } from './unique.js';

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../circlesfera-backend',
);

/** The seeded SUPER_ADMIN (prisma/seed.ts, with ADMIN_E2E_FORCE_TOTP=1). */
export const SEEDED_ADMIN = {
  email: process.env.ADMIN_E2E_EMAIL || 'admin@circlesfera.com',
  password: process.env.ADMIN_E2E_PASSWORD || 'password123',
  totpSecret:
    process.env.ADMIN_E2E_TOTP_SECRET || 'GK3L6YHMZSMTIZMLWAX3DJBYBOENFNJV',
};

type PoolLike = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  end: () => Promise<void>;
};

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(backendRoot, '.env');
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL is required to create test staff.');
}

function pool(): PoolLike {
  const require = createRequire(path.join(backendRoot, 'package.json'));
  const pg = require('pg') as {
    Pool?: new (opts: { connectionString: string }) => PoolLike;
    default?: { Pool: new (opts: { connectionString: string }) => PoolLike };
  };
  const PoolCtor = pg.Pool ?? pg.default?.Pool;
  if (!PoolCtor) throw new Error('Could not load pg.Pool');
  return new PoolCtor({ connectionString: databaseUrl() });
}

export type TestStaff = {
  email: string;
  password: string;
  totpSecret: string;
  remove: () => Promise<void>;
};

/**
 * A staff member holding exactly the given permissions, through a role of
 * their own. Staff sign in with the password of the account they are linked
 * to, so a test account is registered first (on the reserved test domain) and
 * the identity is linked to it with the same email; the authenticator is
 * pre-enrolled. Role id `arole_e2e_…`: the global teardown removes the
 * account, the identity and the role if a test does not.
 */
export async function createStaff(
  request: APIRequestContext,
  permissions: string[],
): Promise<TestStaff> {
  const account = uniqueAccount('e2estaff');
  await registerViaApi(request, account);
  const roleId = `arole_e2e_${uniqueSuffix()}`;
  const db = pool();
  try {
    const signIn = await db.query(
      `SELECT "userId", password FROM "sign_ins" WHERE lower(email) = lower($1)`,
      [account.email],
    );
    const userId = signIn.rows[0]?.userId;
    if (typeof userId !== 'string') {
      throw new Error(`The test account ${account.email} has no sign-in.`);
    }
    await db.query(
      `INSERT INTO "admin_roles" (id, name, description) VALUES ($1, $1, 'E2E test role')`,
      [roleId],
    );
    await db.query(
      `INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
       SELECT $1, id FROM "admin_permissions" WHERE key = ANY($2::text[])`,
      [roleId, permissions],
    );
    const identity = await db.query(
      `INSERT INTO "admin_identities"
         (id, email, "passwordHash", "displayName", status, "totpEnabled", "totpSecret", "linkedUserId", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'E2E staff', 'ACTIVE', true, $3, $4, NOW())
       RETURNING id`,
      [account.email, signIn.rows[0].password, SEEDED_ADMIN.totpSecret, userId],
    );
    await db.query(
      `INSERT INTO "admin_identity_roles" ("adminId", "roleId") VALUES ($1, $2)`,
      [identity.rows[0].id, roleId],
    );
  } finally {
    await db.end();
  }

  return {
    email: account.email,
    password: account.password,
    totpSecret: SEEDED_ADMIN.totpSecret,
    remove: async () => {
      const cleanup = pool();
      try {
        await cleanup.query(`DELETE FROM "admin_identities" WHERE email = $1`, [
          account.email,
        ]);
        await cleanup.query(`DELETE FROM "admin_roles" WHERE id = $1`, [
          roleId,
        ]);
        await cleanup.query(`DELETE FROM "users" WHERE email = $1`, [
          account.email,
        ]);
      } finally {
        await cleanup.end();
      }
    },
  };
}
