import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 14;

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

// For when nobody can get into the staff sites. It changes nothing: for every
// staff account it reports why a sign-in would be refused. A staff member signs
// in with the password of their CircleSfera account, so a refusal that is
// neither a disabled account nor a lockout comes from that account: missing,
// not linked, or with a password that must be reset first.
//
// Accounts are told apart by their roles, never by their address. Neither
// addresses, IP addresses nor hashes are printed: the workflow log that carries
// this output is public. Runs with plain Node inside the production image,
// through the "Ops — staff account access" workflow.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const accounts = await prisma.adminIdentity.findMany({
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
        totpEnabled: true,
        mfaRequired: true,
        roles: { select: { role: { select: { name: true } } } },
        _count: { select: { passkeys: true } },
      },
    });
    const now = Date.now();
    const rolesOf = (account: (typeof accounts)[number]) =>
      account.roles.map((r) => r.role.name).sort();

    if (accounts.length === 0) {
      console.log('There are no staff accounts.');
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
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
