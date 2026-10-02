import { ApiErrorCode } from '@circlesfera/shared';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { uniqueSuffix } from '../utils/unique-id.js';

describe('Forced password reset (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let email: string;
  let csrf: string;
  let csrfCookie: string;
  const password = 'Password123!';
  const newPassword = 'NewPassword456!';

  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrf)
      .send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    csrf = csrfRes.body.csrfToken;
    csrfCookie =
      ((csrfRes.get('Set-Cookie') as string[]) || []).find((c) =>
        c.startsWith('x-csrf-token='),
      ) || '';

    const id = uniqueSuffix();
    email = `forced_${id}@example.com`;
    await post('/auth/register', {
      email,
      password,
      username: `forced_${id}`,
      dateOfBirth: '1990-01-01',
    }).expect(201);

    const user = await prisma.user.update({
      where: { email },
      data: { emailVerified: new Date(), passwordResetRequiredAt: new Date() },
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

  it('rejects the correct password while a reset is required', async () => {
    const res = await post('/auth/login', { identifier: email, password });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(ApiErrorCode.PASSWORD_RESET_REQUIRED);
    expect(res.get('Set-Cookie')?.join(';') ?? '').not.toContain(
      'access_token=',
    );
  });

  it('answers a wrong password exactly as for an unflagged account', async () => {
    const res = await post('/auth/login', {
      identifier: email,
      password: 'WrongPassword1!',
    });
    expect(res.status).toBe(401);
    expect(res.body.message).not.toBe(ApiErrorCode.PASSWORD_RESET_REQUIRED);
  });

  it('lets the user in again after an email password reset', async () => {
    await post('/auth/request-reset', { email });
    const { resetToken } = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { resetToken: false },
    });
    expect(resetToken).toBeTruthy();

    const reset = await post('/auth/reset-password', {
      token: resetToken,
      newPassword,
    });
    expect(reset.status).toBeLessThan(300);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(after.passwordResetRequiredAt).toBeNull();

    const oldLogin = await post('/auth/login', { identifier: email, password });
    expect(oldLogin.status).toBe(401);

    const login = await post('/auth/login', {
      identifier: email,
      password: newPassword,
    });
    expect(login.status).toBeLessThan(300);
    expect(login.get('Set-Cookie')?.join(';')).toContain('access_token=');
  });
});
