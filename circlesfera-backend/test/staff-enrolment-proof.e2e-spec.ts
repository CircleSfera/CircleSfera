import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
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

// A staff identity enrols its authenticator only with a proof beyond the
// password: the link sent to its email, or a code from an administrator.
// Each works once; the secret is shown only after it, once.
describe('Staff enrolment proof (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let operators: AdminOperatorsService;
  const sentLinks: string[] = [];
  let userIds: string[] = [];
  let operatorId: string;
  let email: string;
  const password = 'Password123!';

  const http = () => request(app.getHttpServer());
  const login = () =>
    http().post('/api/v1/admin-auth/login').send({ email, password });

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
    const created = await operators.createOperator(actorIdentity.id, {
      email,
      displayName: 'New staff',
      roleIds: ['arole_support'],
    });
    operatorId = created.id;
  });

  afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({
      where: { targetId: operatorId },
    });
    await prisma.adminIdentity.deleteMany({
      where: { linkedUserId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('sends the link when the identity is created, and the password alone shows no secret', async () => {
    expect(sentLinks).toHaveLength(1);

    const res = await login().expect(200);

    expect(res.body).toEqual({
      status: 'ENROLMENT_PROOF_REQUIRED',
      mfaToken: expect.any(String),
    });
  });

  it('refuses a wrong proof', async () => {
    const { body } = await login().expect(200);

    await http()
      .post('/api/v1/admin-auth/enrol')
      .send({ mfaToken: body.mfaToken, proof: 'WRONG-PROOF-HERE' })
      .expect(401);
  });

  it('a link stops working when the password changes after it was sent', async () => {
    const actorId = (
      await prisma.adminIdentity.findFirstOrThrow({
        where: { linkedUserId: userIds[0] },
      })
    ).id;
    await operators.sendEnrolmentLinkAgain(actorId, operatorId);
    const linkToken = new URL(sentLinks.at(-1) as string).hash.replace(
      '#enrol=',
      '',
    );
    // The same password set again: a new hash, as after a reset.
    await prisma.signIn.update({
      where: { email },
      data: { password: await argon2.hash(password) },
    });

    const { body } = await login().expect(200);
    await http()
      .post('/api/v1/admin-auth/enrol')
      .send({ mfaToken: body.mfaToken, proof: linkToken })
      .expect(401);
  });

  it('a code from an administrator replaces the link, works once, and the authenticator it sets up opens a session', async () => {
    const actorId = (
      await prisma.adminIdentity.findFirstOrThrow({
        where: { linkedUserId: userIds[0] },
      })
    ).id;
    const { code } = await operators.issueEnrolmentCode(actorId, operatorId);
    const linkToken = new URL(sentLinks[0]).hash.replace('#enrol=', '');

    // The link sent before no longer works.
    const first = await login().expect(200);
    await http()
      .post('/api/v1/admin-auth/enrol')
      .send({ mfaToken: first.body.mfaToken, proof: linkToken })
      .expect(401);

    // The code, typed in lower case without dashes.
    const second = await login().expect(200);
    const enrolled = await http()
      .post('/api/v1/admin-auth/enrol')
      .send({
        mfaToken: second.body.mfaToken,
        proof: code.replace(/-/g, '').toLowerCase(),
      })
      .expect(200);
    expect(enrolled.body).toMatchObject({
      status: 'MFA_SETUP_REQUIRED',
      secret: expect.any(String),
    });

    // Once spent, the same code shows nothing again.
    const third = await login().expect(200);
    await http()
      .post('/api/v1/admin-auth/enrol')
      .send({ mfaToken: third.body.mfaToken, proof: code })
      .expect(401);

    // The first code of the new authenticator opens the session.
    const session = await http()
      .post('/api/v1/admin-auth/mfa/verify')
      .send({
        mfaToken: enrolled.body.mfaToken,
        code: generateSync({ secret: enrolled.body.secret }),
      })
      .expect(200);
    expect(String(session.get('Set-Cookie'))).toContain('admin');
    const stored = await prisma.adminIdentity.findUniqueOrThrow({
      where: { id: operatorId },
    });
    expect(stored.totpEnabled).toBe(true);
    expect(stored.enrolmentProofHash).toBeNull();
    const used = await prisma.adminAuditLog.count({
      where: { targetId: operatorId, action: 'ADMIN_ENROLMENT_USED' },
    });
    expect(used).toBe(1);
  });

  it('every proof issued is in the audit log, never the proof itself', async () => {
    const entries = await prisma.adminAuditLog.findMany({
      where: { targetId: operatorId, action: 'ADMIN_ENROLMENT_ISSUED' },
    });

    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      expect(entry.details).not.toMatch(/enrol=|[A-Z2-9]{4}-[A-Z2-9]{4}/);
    }
  });
});
