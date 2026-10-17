import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { generateSecret, generateSync } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { CryptoService } from '../../src/common/services/crypto.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { uniqueSuffix } from '../utils/unique-id.js';

// The account keeps only the passkey challenge; the credentials and
// one-time tokens are on the sign-in.
const ACCOUNT_SECRET_FIELDS = ['currentChallenge'] as const;
const SIGN_IN_SECRET_FIELDS = [
  'password',
  'twoFactorSecret',
  'resetToken',
  'verificationToken',
] as const;

describe('Secret columns are omitted by default (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let email: string;
  let username: string;
  let csrf: string;
  let csrfCookie: string;
  const password = 'Password123!';
  const totpSecret = generateSecret();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    const crypto = app.get(CryptoService);

    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    csrf = csrfRes.body.csrfToken;
    csrfCookie =
      ((csrfRes.get('Set-Cookie') as string[]) || []).find((c) =>
        c.startsWith('x-csrf-token='),
      ) || '';

    const id = uniqueSuffix();
    email = `omit_${id}@example.com`;
    username = `omit_${id}`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrf)
      .send({ email, password, username, dateOfBirth: '1990-01-01' })
      .expect(201);

    const signIn = await prisma.signIn.update({
      where: { email },
      data: {
        emailVerified: new Date(),
        isTwoFactorEnabled: true,
        twoFactorSecret: crypto.encrypt(totpSecret),
      },
      select: { userId: true },
    });
    userId = signIn.userId;
  });

  afterAll(async () => {
    if (prisma && userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (app) await app.close();
  });

  it('does not return secret columns from a plain User read', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    for (const field of ACCOUNT_SECRET_FIELDS) {
      expect(Object.keys(user), field).not.toContain(field);
    }
    // No credential column is left on the account.
    for (const field of SIGN_IN_SECRET_FIELDS) {
      expect(Object.keys(user), field).not.toContain(field);
    }
    expect(user.email).toBe(email);
    const signIn = await prisma.signIn.findUniqueOrThrow({ where: { email } });
    for (const field of SIGN_IN_SECRET_FIELDS) {
      expect(Object.keys(signIn), field).not.toContain(field);
    }
  });

  it('does not return secret columns through a relation include', async () => {
    const profile = await prisma.profile.findFirstOrThrow({
      where: { userId },
      include: { user: true, signIn: true },
    });
    for (const field of ACCOUNT_SECRET_FIELDS) {
      expect(Object.keys(profile.user), field).not.toContain(field);
    }
    for (const field of SIGN_IN_SECRET_FIELDS) {
      expect(Object.keys(profile.signIn ?? {}), field).not.toContain(field);
    }
  });

  it('returns a secret column only when the query opts in', async () => {
    const signIn = await prisma.signIn.findUniqueOrThrow({
      where: { email },
      omit: { password: false, twoFactorSecret: false },
    });
    expect(signIn.password).toMatch(/^\$argon2/);
    expect(signIn.twoFactorSecret).toBeTruthy();
  });

  it('still lets a 2FA-enabled user log in (login opts in to password and secret)', async () => {
    const missingCode = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrf)
      .send({ identifier: email, password });
    expect(missingCode.status).toBe(401);

    const ok = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrf)
      .send({
        identifier: email,
        password,
        twoFactorCode: generateSync({ secret: totpSecret }),
      });
    expect(ok.status).toBe(200);

    const byUsername = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrf)
      .send({
        identifier: username,
        password,
        twoFactorCode: generateSync({ secret: totpSecret }),
      });
    expect(byUsername.status).toBe(200);

    const wrong = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrf)
      .send({ identifier: email, password: 'WrongPassword123!' });
    expect(wrong.status).toBe(401);
  });
});
