/**
 * Bootstrap an Admin Panel AdminIdentity.
 *
 * Usage:
 *   npx ts-node scripts/bootstrap-admin.ts <email> <password> [displayName] [ROLE]
 *
 * ROLE defaults to SUPER_ADMIN.
 * Prints MFA enrollment reminder — first login requires TOTP setup.
 */
import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import pkg from 'pg';

const { Pool } = pkg;

const ROLE_IDS: Record<string, string> = {
  SUPER_ADMIN: 'arole_super',
  PLATFORM_ADMIN: 'arole_platform',
  MODERATION_ADMIN: 'arole_moderation',
  SUPPORT_ADMIN: 'arole_support',
  FINANCE_ADMIN: 'arole_finance',
  CONTENT_ADMIN: 'arole_content',
  SECURITY_ADMIN: 'arole_security',
  ANALYTICS_ADMIN: 'arole_analytics',
};

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const displayName = process.argv[4] || email?.split('@')[0] || 'Admin';
  const roleName = (process.argv[5] || 'SUPER_ADMIN').toUpperCase();

  if (!email || !password) {
    console.error(
      'Usage: ts-node scripts/bootstrap-admin.ts <email> <password> [displayName] [ROLE]',
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('Password must be at least 12 characters');
    process.exit(1);
  }

  const roleId = ROLE_IDS[roleName];
  if (!roleId) {
    console.error(
      `Unknown role ${roleName}. Valid: ${Object.keys(ROLE_IDS).join(', ')}`,
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await argon2.hash(password);
    const linkedUser = await prisma.user.findUnique({ where: { email } });

    const admin = await prisma.adminIdentity.upsert({
      where: { email },
      create: {
        id: randomBytes(16).toString('hex'),
        email,
        passwordHash,
        displayName,
        status: 'ACTIVE',
        mfaRequired: true,
        totpEnabled: false,
        linkedUserId: linkedUser?.id ?? null,
        roles: { create: [{ roleId }] },
      },
      update: {
        passwordHash,
        displayName,
        status: 'ACTIVE',
        failedLoginCount: 0,
        lockedUntil: null,
        linkedUserId: linkedUser?.id ?? undefined,
      },
      include: { roles: { include: { role: true } } },
    });

    // Ensure role assignment on update
    await prisma.adminIdentityRole.upsert({
      where: { adminId_roleId: { adminId: admin.id, roleId } },
      create: { adminId: admin.id, roleId },
      update: {},
    });

    if (linkedUser && linkedUser.role !== 'USER') {
      await prisma.user.update({
        where: { id: linkedUser.id },
        data: { role: 'USER' },
      });
    }

    const fingerprint = createHash('sha256')
      .update(admin.id)
      .digest('hex')
      .slice(0, 8);

    console.log('Admin Panel AdminIdentity ready');
    console.log(`  id:          ${admin.id}`);
    console.log(`  email:       ${admin.email}`);
    console.log(`  displayName: ${admin.displayName}`);
    console.log(`  role:        ${roleName}`);
    console.log(`  fingerprint: ${fingerprint}`);
    console.log('');
    console.log(
      'Next: sign in at admin.circlesfera.com and enroll MFA (required).',
    );
    console.log('Legacy grant-admin.ts (User.role=ADMIN) is deprecated.');
  } catch (err) {
    console.error('bootstrap-admin failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
