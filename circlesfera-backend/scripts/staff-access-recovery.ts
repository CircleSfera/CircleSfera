// Break-glass recovery of a staff identity, for when no administrator can
// sign in to give a code (for example the owner lost the phone with the
// authenticator and every passkey). Run only by the "Ops — staff access
// recovery" workflow, which needs the owner's GitHub account; the link it
// sends needs the identity's mailbox. The two together stand for the
// administrator who would otherwise hand over a code.
//
// For the identity whose reference (the first eight characters of its id,
// as the Operators screen and the staff access check show it) is given:
// - its authenticator, passkeys, sessions and any earlier link or code go;
// - a new access link goes to its staff email, as an invitation does. With
//   it the person sets a new password and a new authenticator.
// Nothing secret is printed: the workflow log is public. The address is
// never printed either.
//
// Runs with plain Node inside the production image, next to the compiled
// app in dist/, whose proof service and email template it reuses.
import 'reflect-metadata';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import pkg from 'pg';
import { EnrolmentProofService } from '../dist/admin-auth/enrolment-proof.service.js';
import { DEFAULT_LOCALE } from '../dist/common/constants/locale.constants.js';
import { QUEUE_NAMES } from '../dist/common/constants/queue-policy.constants.js';
import { EmailTemplates } from '../dist/email/email-templates.js';

const { Pool } = pkg;

const REFERENCE = /^[0-9a-f]{8}$/;

async function main() {
  const reference = (process.argv[2] ?? '').trim().toLowerCase();
  if (!REFERENCE.test(reference)) {
    throw new Error(
      'Give the reference of the staff account: the first 8 characters of its id.',
    );
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const queue = new Queue(QUEUE_NAMES.EMAIL_PROCESSING, {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    },
  });

  try {
    const matches = await prisma.adminIdentity.findMany({
      where: { id: { startsWith: reference } },
      select: { id: true, email: true, status: true },
    });
    if (matches.length !== 1) {
      throw new Error(
        matches.length === 0
          ? `No staff account has the reference ${reference}.`
          : `More than one staff account starts with ${reference}; nothing was changed.`,
      );
    }
    const [admin] = matches;
    if (admin.status !== 'ACTIVE') {
      throw new Error(
        `The staff account ${reference} is disabled; nothing was changed.`,
      );
    }

    await prisma.$transaction([
      prisma.adminIdentity.update({
        where: { id: admin.id },
        data: {
          totpSecret: null,
          totpEnabled: false,
          failedLoginCount: 0,
          lockedUntil: null,
          enrolmentProofHash: null,
          enrolmentProofExpiresAt: null,
          enrolmentProofPasswordMark: null,
        },
      }),
      prisma.adminRefreshToken.deleteMany({ where: { adminId: admin.id } }),
      prisma.adminPasskey.deleteMany({ where: { adminId: admin.id } }),
    ]);

    // The email goes through the app's queue, as every email does.
    const email = {
      async sendStaffEnrolmentEmail(to: string, url: string) {
        const rendered = EmailTemplates.staffEnrolment(
          {
            locale: DEFAULT_LOCALE,
            frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
          },
          url,
        );
        await queue.add('send-transactional-email', {
          to,
          subject: rendered.subject,
          html: rendered.html,
        });
      },
    };
    const config = { get: (key: string) => process.env[key] };
    const proofs = new EnrolmentProofService(
      prisma as never,
      email as never,
      config as never,
    );
    await proofs.sendLink({ id: admin.id, email: admin.email });

    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: 'ADMIN_ENROLMENT_ISSUED',
        targetType: 'admin',
        targetId: admin.id,
        details: 'Access reset and link sent from the Ops workflow',
      },
    });

    console.log(
      `Staff account ${reference}: access reset (authenticator, passkeys and sessions removed) and an access link sent to its staff email. It works once, for 24 hours.`,
    );
  } finally {
    await queue.close();
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Recovery failed');
  process.exit(1);
});
