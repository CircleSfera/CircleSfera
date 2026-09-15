import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { uniqueSuffix } from '../utils/unique-id.js';

describe('Secrets Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let userCookie: string;
  let userCsrf: string;

  const uniqueId = uniqueSuffix();
  const testUser = {
    email: `secrets_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `secrets_user_${uniqueId}`,
    dateOfBirth: '1990-01-01',
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

    // Register User
    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    userCsrf = csrfRes.body.csrfToken;
    const cookies = (csrfRes.get('Set-Cookie') as string[]) || [];
    userCookie = cookies.find((c) => c.startsWith('x-csrf-token=')) || '';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [userCookie])
      .set('x-csrf-token', userCsrf)
      .send(testUser)
      .expect(201);

    // Add fake reset token for testing
    await prisma.user.update({
      where: { email: testUser.email },
      data: {
        emailVerified: new Date(),
        resetToken: `secret-reset-token-${uniqueId}`,
        resetTokenExpires: new Date(Date.now() + 3600000),
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [userCookie])
      .set('x-csrf-token', userCsrf)
      .send({ identifier: testUser.email, password: testUser.password })
      .expect(200);

    const authCookies = (loginRes.get('Set-Cookie') as string[]) || [];
    userCookie = [userCookie, ...authCookies].join('; ');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should not expose secrets in /profiles/me', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/profiles/me')
      .set('Cookie', [userCookie])
      .set('x-csrf-token', userCsrf)
      .expect(200);

    const body = res.body;
    expect(body.password).toBeUndefined();
    expect(body.verificationToken).toBeUndefined();
    expect(body.resetToken).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();

    // Also check it doesn't leak inside profile object if nested
    if (body.profile) {
      expect(body.profile.password).toBeUndefined();
    }
  });

  it('should not expose secrets in /profiles/:username', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/profiles/${testUser.username}`)
      .set('Cookie', [userCookie])
      .set('x-csrf-token', userCsrf)
      .expect(200);

    const body = res.body;
    expect(body.password).toBeUndefined();
    expect(body.verificationToken).toBeUndefined();
    expect(body.resetToken).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();

    // Check user object if nested
    if (body.user) {
      expect(body.user.password).toBeUndefined();
      expect(body.user.verificationToken).toBeUndefined();
      expect(body.user.resetToken).toBeUndefined();
    }
  });
});
