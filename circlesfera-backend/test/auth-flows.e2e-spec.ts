import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */

describe('Authentication Flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let csrfToken: string;
  let csrfCookie: string;

  const uniqueId = Date.now();
  const testUser = {
    email: `auth_flow_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `auth_user_${uniqueId}`,
    fullName: 'Auth Flow User',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);

    // Pre-test cleanup
    await prisma.user.deleteMany({
      where: { email: { contains: uniqueId.toString() } },
    });

    // Initial CSRF
    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    csrfToken = csrfRes.body.csrfToken;
    const cookies = (csrfRes.get('Set-Cookie') as string[]) || [];
    csrfCookie = cookies.find((c) => c.startsWith('x-csrf-token=')) || '';
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
    await app.close();
  });

  it('Flow: Register -> Verify Email -> Login', async () => {
    // 1. Register
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(testUser)
      .expect(201);

    const user = await prisma.user.findUnique({
      where: { email: testUser.email },
    });
    expect(user).toBeDefined();
    expect(user?.emailVerified).toBeNull();

    // 2. Verify Email (Extract token from DB)
    const verificationToken = user?.verificationToken;
    expect(verificationToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: verificationToken })
      .expect(200);

    const verifiedUser = await prisma.user.findUnique({
      where: { email: testUser.email },
    });
    expect(verifiedUser?.emailVerified).not.toBeNull();

    // 3. Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        identifier: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    const authCookies = (loginRes.get('Set-Cookie') as string[]) || [];
    expect(authCookies.some((c) => c.includes('access_token'))).toBe(true);
  });

  it('Flow: Password Reset', async () => {
    // 1. Request Reset
    await request(app.getHttpServer())
      .post('/api/v1/auth/request-reset')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ email: testUser.email })
      .expect(200);

    const user = await prisma.user.findUnique({
      where: { email: testUser.email },
    });
    const resetToken = user?.resetToken;
    expect(resetToken).toBeDefined();

    // 2. Reset Password
    const newPassword = 'NewPassword123!';
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        token: resetToken,
        newPassword,
      })
      .expect(200);

    // 3. Try login with old password (should fail)
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        identifier: testUser.email,
        password: testUser.password,
      })
      .expect(401);

    // 4. Login with new password
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        identifier: testUser.email,
        password: newPassword,
      })
      .expect(200);

    const authCookies = (loginRes.get('Set-Cookie') as string[]) || [];
    expect(authCookies.some((c) => c.includes('access_token'))).toBe(true);
  });
});
