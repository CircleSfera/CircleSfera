import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { generateSync } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AdminOperatorsService } from '../src/admin/admin-operators.service.js';
import { AppModule } from './../src/app.module.js';
import { EmailService } from '../src/email/email.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createUserWithProfile } from './factories/index.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

// A staff identity needs no CircleSfera account: it sets up its access, a
// password of its own and then an authenticator, from the link sent to its
// email or a code from an administrator. Each works once. A CircleSfera
// account with the same email plays no part, and its password never opens
// the staff sites.
describe('Staff access set-up (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let operators: AdminOperatorsService;
  const sentLinks: string[] = [];
  let userIds: string[] = [];
  let actorId: string;
  let operatorId: string;
  let email: string;
  // The password of the CircleSfera accounts the factory makes.
  const accountPassword = 'Password123!';
  const staffPassword = 'a long staff password of its own';

  const http = () => request(app.getHttpServer());
  const login = (password: string) =>
    http().post('/api/v1/admin-auth/login').send({ email, password });
  const setUp = (proof: string, password = staffPassword) =>
    http().post('/api/v1/admin-auth/access').send({ email, proof, password });
  const tokenOf = (link: string) =>
    new URLSearchParams(new URL(link).hash.slice(1)).get('enrol') ?? '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    operators = app.get(AdminOperatorsService);
    // The link is read where the email would be sent, not from the mailbox.
    vi.spyOn(
      app.get(EmailService),
      'sendStaffEnrolmentEmail',
    ).mockImplementation(async (_to: string, url: string) => {
      sentLinks.push(url);
    });

    const actor = await createUserWithProfile(prisma);
    // A CircleSfera account with the staff email: it is never linked.
    const person = await createUserWithProfile(prisma);
    userIds = [actor.user.id, person.user.id];
    email = person.user.email;
    const actorIdentity = await prisma.adminIdentity.create({
      data: {
        email: actor.user.email,
        passwordHash: 'unused',
        displayName: 'Actor',
        totpEnabled: true,
        linkedUserId: actor.user.id,
      },
    });
    actorId = actorIdentity.id;
    const created = await operators.createOperator(actorId, {
      email,
      displayName: 'New staff',
      roleIds: ['arole_support'],
    });
    operatorId = created.id;
  });

  afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({
      where: { targetId: { in: [operatorId, actorId] } },
    });
    await prisma.adminIdentity.deleteMany({
      where: { id: { in: [operatorId, actorId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('sends the link when the identity is created, linked to no account', async () => {
    expect(sentLinks).toHaveLength(1);
    const link = new URL(sentLinks[0]);
    expect(link.pathname).toBe('/login');
    expect(new URLSearchParams(link.hash.slice(1)).get('email')).toBe(email);
    const stored = await prisma.adminIdentity.findUniqueOrThrow({
      where: { id: operatorId },
    });
    expect(stored.linkedUserId).toBeNull();
  });

  it('never takes the password of the account with the staff email', async () => {
    await login(accountPassword).expect(401);
  });

  it('refuses a wrong proof', async () => {
    await setUp('WRONG-PROOF-HERE').expect(401);
  });

  it('refuses the account password as the staff password, and the link still works after', async () => {
    const res = await setUp(tokenOf(sentLinks[0]), accountPassword).expect(400);
    expect(res.body.errorCode).toBe('STAFF_PASSWORD_IS_ACCOUNT_PASSWORD');
    const stored = await prisma.adminIdentity.findUniqueOrThrow({
      where: { id: operatorId },
    });
    expect(stored.enrolmentProofHash).not.toBeNull();
  });

  it('a code from an administrator replaces the link, works once, and sets up the password and the authenticator', async () => {
    const { code } = await operators.issueEnrolmentCode(actorId, operatorId);

    // The link sent before no longer works.
    await setUp(tokenOf(sentLinks[0])).expect(401);

    // The code, typed in lower case without dashes.
    const set = await setUp(code.replace(/-/g, '').toLowerCase()).expect(200);
    expect(set.body).toMatchObject({
      status: 'MFA_SETUP_REQUIRED',
      secret: expect.any(String),
    });
    // No session before the authenticator is confirmed.
    expect(set.get('Set-Cookie')).toBeUndefined();

    // Once spent, the same code does nothing again.
    await setUp(code).expect(401);

    // The first code of the new authenticator opens the session.
    const session = await http()
      .post('/api/v1/admin-auth/mfa/verify')
      .send({
        mfaToken: set.body.mfaToken,
        code: generateSync({ secret: set.body.secret }),
      })
      .expect(200);
    expect(String(session.get('Set-Cookie'))).toContain('admin');

    const stored = await prisma.adminIdentity.findUniqueOrThrow({
      where: { id: operatorId },
    });
    expect(stored.totpEnabled).toBe(true);
    expect(stored.enrolmentProofHash).toBeNull();
    expect(stored.passwordHash).toMatch(/^\$argon2/);
    const passwordSet = await prisma.adminAuditLog.count({
      where: { targetId: operatorId, action: 'ADMIN_PASSWORD_SET' },
    });
    expect(passwordSet).toBe(1);
  });

  it('signs in with the staff password, and still never with the account one', async () => {
    const res = await login(staffPassword).expect(200);
    expect(res.body).toEqual({
      status: 'MFA_REQUIRED',
      mfaToken: expect.any(String),
    });
    await login(accountPassword).expect(401);
  });

  it('an identity made before still signs in with its linked account password until it sets its own', async () => {
    const res = await http()
      .post('/api/v1/admin-auth/login')
      .send({
        email: (
          await prisma.adminIdentity.findUniqueOrThrow({
            where: { id: actorId },
          })
        ).email,
        password: accountPassword,
      })
      .expect(200);
    expect(res.body.status).toBe('MFA_REQUIRED');
  });

  it('every proof issued is in the audit log, never the proof itself', async () => {
    const entries = await prisma.adminAuditLog.findMany({
      where: { targetId: operatorId, action: 'ADMIN_ENROLMENT_ISSUED' },
    });

    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.details).not.toMatch(/enrol=|[A-Z2-9]{4}-[A-Z2-9]{4}/);
    }
  });
});
