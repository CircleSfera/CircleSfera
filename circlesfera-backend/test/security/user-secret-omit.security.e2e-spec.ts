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

const SECRET_FIELDS = [
  'password',
  'twoFactorSecret',
  'resetToken',
  'verificationToken',
  'currentChallenge',
] as const;

describe('User secret columns are omitted by default (e2e)', () => {
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

    const user = await prisma.user.update({
      where: { email },
      data: {
        emailVerified: new Date(),
        isTwoFactorEnabled: true,
        twoFactorSecret: crypto.encrypt(totpSecret),
      },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (prisma && userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (app) await app.close();
  });

  it('does not return secret columns from a plain User read', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    for (const field of SECRET_FIELDS) {
      expect(Object.keys(user), field).not.toContain(field);
    }
    expect(user.email).toBe(email);
  });

  it('does not return secret columns through a relation include', async () => {
    const profile = await prisma.profile.findFirstOrThrow({
      where: { userId },
      include: { user: true },
    });
    for (const field of SECRET_FIELDS) {
      expect(Object.keys(profile.user), field).not.toContain(field);
    }
  });

  it('returns a secret column only when the query opts in', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { password: false, twoFactorSecret: false },
    });
    expect(user.password).toMatch(/^\$argon2/);
    expect(user.twoFactorSecret).toBeTruthy();
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
