import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */

describe('Profiles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let csrfToken: string;
  let csrfCookie: string;

  // Unique user for this test run
  const uniqueId = Date.now();
  const testUser = {
    email: `profile_e2e_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `profile_user_${uniqueId}`,
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

    // 1. Get CSRF Token
    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    csrfToken = csrfRes.body.csrfToken;
    const cookies = (csrfRes.get('Set-Cookie') as string[]) || [];
    csrfCookie = cookies.find((c) => c.startsWith('x-csrf-token=')) || '';

    // 2. Register and login
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(testUser);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        identifier: testUser.email,
        password: testUser.password,
      });

    const authCookies = (loginRes.get('Set-Cookie') as string[]) || [];
    const accessCookie = authCookies.find((c) => c.startsWith('access_token='));
    accessToken = accessCookie?.split(';')[0].split('=')[1] || '';

    // Refresh CSRF cookie if it changed during login
    const sessionCsrfCookie = authCookies.find((c) =>
      c.startsWith('x-csrf-token='),
    );
    if (sessionCsrfCookie) {
      csrfCookie = sessionCsrfCookie;
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
    await app.close();
  });

  it('/api/v1/profiles/me (GET) - Get own profile', () => {
    return request(app.getHttpServer())
      .get('/api/v1/profiles/me')
      .set('Cookie', [`access_token=${accessToken}`])
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.username).toBe(testUser.username);
      });
  });

  it('/api/v1/profiles/me (PUT) - Update profile bio and name', () => {
    const updateData = {
      fullName: 'Updated Name',
      bio: 'New bio content via E2E',
    };

    return request(app.getHttpServer())
      .put('/api/v1/profiles/me')
      .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(updateData)
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.fullName).toBe(updateData.fullName);
        expect(res.body.bio).toBe(updateData.bio);
      });
  });

  it('/api/v1/profiles/me (PUT) - Update and then clear website', async () => {
    // 1. Set website
    const updateWithWebsite = {
      website: 'https://example.com',
    };

    await request(app.getHttpServer())
      .put('/api/v1/profiles/me')
      .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(updateWithWebsite)
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.website).toBe(updateWithWebsite.website);
      });

    // 2. Clear website (set to null)
    const clearWebsite = {
      website: null,
    };

    await request(app.getHttpServer())
      .put('/api/v1/profiles/me')
      .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(clearWebsite)
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.website).toBe(null);
      });
  });

  it('/api/v1/profiles/:username (GET) - Get public profile', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/profiles/${testUser.username}`)
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.username).toBe(testUser.username);
      });
  });
});
