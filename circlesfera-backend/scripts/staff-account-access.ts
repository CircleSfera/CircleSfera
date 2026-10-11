import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import pkg from 'pg';

const { Pool } = pkg;

const MIN_PASSWORD_LENGTH = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

// Reports the state of one staff account, or gives it a new password.
//
// STAFF_ACCESS_MODE=check changes nothing. It says whether the account exists
// and why a sign-in would be refused: disabled, locked, or neither (in which
// case the stored password is not the one being typed).
//
// STAFF_ACCESS_MODE=reset stores STAFF_ACCESS_PASSWORD, clears the lockout and
// closes the account's sessions. A disabled account is left alone unless
// STAFF_ACCESS_REACTIVATE=true. The second factor is not touched.
//
// The address and the password come from the environment (never argv) and are
// never printed, and neither are IP addresses or hashes: the workflow log that
// carries this output is public. Runs with plain Node inside the production
// image, through the "Ops — staff account access" workflow.
async function main() {
  const mode = process.env.STAFF_ACCESS_MODE;
  const email = process.env.STAFF_ACCESS_EMAIL?.trim().toLowerCase();
  const password = process.env.STAFF_ACCESS_PASSWORD;
  const reactivate = process.env.STAFF_ACCESS_REACTIVATE === 'true';
  const connectionString = process.env.DATABASE_URL;

  if (mode !== 'check' && mode !== 'reset') {
    throw new Error('STAFF_ACCESS_MODE must be "check" or "reset"');
  }
  if (!email) throw new Error('STAFF_ACCESS_EMAIL must be set');
  if (mode === 'reset') {
    if (!password) throw new Error('STAFF_ACCESS_PASSWORD must be set');
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `STAFF_ACCESS_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
  }
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const account = await prisma.adminIdentity.findUnique({
      where: { email },
      select: {
        id: true,
        status: true,
        failedLoginCount: true,
        lockedUntil: true,
        lastLoginAt: true,
        updatedAt: true,
        passwordHash: true,
        totpEnabled: true,
        mfaRequired: true,
        _count: { select: { roles: true, passkeys: true } },
      },
    });

    if (!account) {
      const total = await prisma.adminIdentity.count();
      console.log('Staff account: NOT FOUND for the given address.');
      console.log(`Staff accounts in total: ${total}`);
      if (mode === 'reset') {
        throw new Error('No staff account with STAFF_ACCESS_EMAIL');
      }
      return;
    }

    const now = Date.now();
    const locked = !!account.lockedUntil && account.lockedUntil.getTime() > now;

    if (mode === 'check') {
      const failedSince = (ms: number) =>
        prisma.adminAuditLog.count({
          where: {
            adminId: account.id,
            action: 'ADMIN_LOGIN_FAILED',
            createdAt: { gte: new Date(now - ms) },
          },
        });
      const [failedDay, failedWeek] = await Promise.all([
        failedSince(DAY_MS),
        failedSince(7 * DAY_MS),
      ]);
      const lockMinutes = locked
        ? Math.ceil(((account.lockedUntil?.getTime() ?? now) - now) / 60000)
        : 0;

      console.log('Staff account: found.');
      console.log(`Status: ${account.status}`);
      console.log(
        locked ? `Locked: yes, for ${lockMinutes} more minutes` : 'Locked: no',
      );
      console.log(`Failed attempts counter: ${account.failedLoginCount}`);
      console.log(`Failed sign-ins in the last day: ${failedDay}`);
      console.log(`Failed sign-ins in the last week: ${failedWeek}`);
      const daysAgo = (date: Date) =>
        `${Math.floor((now - date.getTime()) / DAY_MS)} days ago`;
      // Only the kind of hash is told, never the hash: sign-in accepts the
      // first two and refuses anything else.
      const passwordFormat = account.passwordHash.startsWith('$argon2')
        ? 'argon2'
        : /^\$2[aby]\$/.test(account.passwordHash)
          ? 'bcrypt'
          : 'not recognised';
      console.log(
        `Last sign-in: ${account.lastLoginAt ? daysAgo(account.lastLoginAt) : 'never'}`,
      );
      console.log(`Record last changed: ${daysAgo(account.updatedAt)}`);
      console.log(`Stored password format: ${passwordFormat}`);
      console.log(
        `Second factor: ${account.totpEnabled ? 'set up' : 'not set up'}${
          account.mfaRequired ? ', required' : ''
        }`,
      );
      console.log(`Passkeys: ${account._count.passkeys}`);
      console.log(`Roles: ${account._count.roles}`);
      return;
    }

    if (account.status !== 'ACTIVE' && !reactivate) {
      throw new Error(
        `The staff account is ${account.status}; run again with reactivation to change that`,
      );
    }

    const passwordHash = await argon2.hash(password as string);
    const [, sessions] = await prisma.$transaction([
      prisma.adminIdentity.update({
        where: { id: account.id },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          ...(reactivate ? { status: 'ACTIVE' as const } : {}),
        },
      }),
      prisma.adminRefreshToken.deleteMany({ where: { adminId: account.id } }),
      prisma.adminAuditLog.create({
        data: {
          adminId: account.id,
          action: 'MANUAL_OVERRIDE',
          targetType: 'admin',
          targetId: account.id,
          details:
            account.status !== 'ACTIVE'
              ? 'Password reset and account reactivated by the staff account access operation'
              : 'Password reset by the staff account access operation',
        },
      }),
    ]);
    console.log(
      `Staff account password reset. Lockout cleared. Closed ${sessions.count} sessions.`,
    );
    if (account.status !== 'ACTIVE') console.log('Account reactivated.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
