import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import pkg from 'pg';

const { Pool } = pkg;

const MIN_PASSWORD_LENGTH = 12;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 14;
const OWNER_ROLE = 'SUPER_ADMIN';

// Only the kind of hash is told, never the hash: sign-in accepts the first two
// and refuses anything else.
const hashFormat = (hash: string) =>
  hash.startsWith('$argon2')
    ? 'argon2'
    : /^\$2[aby]\$/.test(hash)
      ? 'bcrypt'
      : 'not recognised';

// Audit details may quote the address of the account they are about.
const withoutAddresses = (text: string) =>
  text.replace(/\S+@\S+/g, '[address]');

// For when nobody can get into the staff sites. Day to day, a staff member's
// password, status and second factor are managed from the Operators screen by
// someone who can sign in.
//
// STAFF_ACCESS_MODE=check changes nothing. It reports, for every staff
// account, why a sign-in would be refused: disabled, locked, or neither (in
// which case the stored password is not the one being typed).
//
// STAFF_ACCESS_MODE=reset stores STAFF_ACCESS_PASSWORD on the only account
// with the owner role, clears its lockout and closes its sessions. With more
// than one such account the others can do this from the panel, so the reset
// asks which one through STAFF_ACCESS_EMAIL. A disabled account is left alone
// unless STAFF_ACCESS_REACTIVATE=true. The second factor is not touched.
//
// Accounts are told apart by their roles, never by their address. The address
// and the password come from the environment (never argv) and are never
// printed, and neither are IP addresses or hashes: the workflow log that
// carries this output is public. Runs with plain Node inside the production
// image, through the "Ops — staff account access" workflow.
async function main() {
  const mode = process.env.STAFF_ACCESS_MODE;
  const email =
    process.env.STAFF_ACCESS_EMAIL?.trim().toLowerCase() || undefined;
  const password = process.env.STAFF_ACCESS_PASSWORD;
  const reactivate = process.env.STAFF_ACCESS_REACTIVATE === 'true';
  const connectionString = process.env.DATABASE_URL;

  if (mode !== 'check' && mode !== 'reset') {
    throw new Error('STAFF_ACCESS_MODE must be "check" or "reset"');
  }
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
    const accounts = await prisma.adminIdentity.findMany({
      where: email ? { email } : undefined,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        failedLoginCount: true,
        lockedUntil: true,
        lastLoginAt: true,
        updatedAt: true,
        email: true,
        linkedUserId: true,
        passwordHash: true,
        totpEnabled: true,
        mfaRequired: true,
        roles: { select: { role: { select: { name: true } } } },
        _count: { select: { passkeys: true } },
      },
    });
    const now = Date.now();
    const rolesOf = (account: (typeof accounts)[number]) =>
      account.roles.map((r) => r.role.name).sort();

    if (mode === 'check') {
      if (accounts.length === 0) {
        console.log(
          email
            ? 'Staff account: NOT FOUND for the given address.'
            : 'There are no staff accounts.',
        );
        return;
      }
      const daysAgo = (date: Date) =>
        `${Math.floor((now - date.getTime()) / DAY_MS)} days ago`;
      console.log(`Staff accounts: ${accounts.length}`);

      for (const [index, account] of accounts.entries()) {
        const locked =
          !!account.lockedUntil && account.lockedUntil.getTime() > now;
        const lockMinutes = locked
          ? Math.ceil(((account.lockedUntil?.getTime() ?? now) - now) / 60000)
          : 0;
        const passwordFormat = hashFormat(account.passwordHash);
        // Staff sign in with the password of the CircleSfera sign-in that has
        // their email and belongs to their linked user.
        const signIn = await prisma.signIn.findUnique({
          where: { email: account.email },
          select: {
            userId: true,
            password: true,
            passwordResetRequiredAt: true,
          },
        });
        const signInState = !account.linkedUserId
          ? 'no: the staff account is linked to no user'
          : !signIn
            ? 'no: no sign-in has the staff email'
            : signIn.userId !== account.linkedUserId
              ? 'no: that sign-in belongs to another user'
              : signIn.passwordResetRequiredAt
                ? 'no: it must set a new password first'
                : hashFormat(signIn.password) === 'not recognised'
                  ? 'no: its stored password is in a format sign-in refuses'
                  : 'yes';
        const recent = await prisma.adminAuditLog.groupBy({
          by: ['action', 'details'],
          where: {
            targetType: 'admin',
            targetId: account.id,
            createdAt: { gte: new Date(now - RECENT_DAYS * DAY_MS) },
          },
          _count: { _all: true },
          _max: { createdAt: true },
        });
        const failedDay = await prisma.adminAuditLog.count({
          where: {
            adminId: account.id,
            action: 'ADMIN_LOGIN_FAILED',
            createdAt: { gte: new Date(now - DAY_MS) },
          },
        });

        console.log('');
        console.log(
          `Account ${index + 1} — roles: ${rolesOf(account).join(', ') || 'none'}`,
        );
        console.log(`  Status: ${account.status}`);
        console.log(
          locked
            ? `  Locked: yes, for ${lockMinutes} more minutes`
            : '  Locked: no',
        );
        console.log(`  Failed attempts counter: ${account.failedLoginCount}`);
        console.log(`  Failed sign-ins in the last day: ${failedDay}`);
        console.log(
          `  Last sign-in: ${account.lastLoginAt ? daysAgo(account.lastLoginAt) : 'never'}`,
        );
        console.log(`  Record last changed: ${daysAgo(account.updatedAt)}`);
        console.log(`  Password comes from the user sign-in: ${signInState}`);
        console.log(
          `  Own stored password format (no longer used): ${passwordFormat}`,
        );
        console.log(
          `  Second factor: ${account.totpEnabled ? 'set up' : 'not set up'}${
            account.mfaRequired ? ', required' : ''
          }`,
        );
        console.log(`  Passkeys: ${account._count.passkeys}`);
        console.log(`  Recorded on this account, last ${RECENT_DAYS} days:`);
        if (recent.length === 0) console.log('    nothing');
        for (const entry of recent) {
          const last = entry._max.createdAt;
          console.log(
            `    ${entry.action}${entry.details ? ` (${withoutAddresses(entry.details)})` : ''}: ${
              entry._count._all
            }, last ${last ? daysAgo(last) : 'unknown'}`,
          );
        }
      }
      return;
    }

    // The address only chooses among accounts with the owner role; it never
    // widens the reset to another staff account.
    const candidates = accounts.filter((account) =>
      rolesOf(account).includes(OWNER_ROLE),
    );
    if (candidates.length === 0) {
      throw new Error(
        email
          ? `No staff account with STAFF_ACCESS_EMAIL holds the ${OWNER_ROLE} role`
          : `No staff account holds the ${OWNER_ROLE} role`,
      );
    }
    if (candidates.length > 1) {
      throw new Error(
        `${candidates.length} staff accounts hold the ${OWNER_ROLE} role; set STAFF_ACCESS_EMAIL to choose one`,
      );
    }
    const account = candidates[0];

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
