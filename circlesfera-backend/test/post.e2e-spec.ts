import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */

describe('Posts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let csrfToken: string;
  let csrfCookie: string;

  // Unique user for this test run
  const uniqueId = Date.now();
  const testUser = {
    email: `post_e2e_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `post_user_${uniqueId}`,
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

    // 2. Register and login to get token
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

    // Merge cookies for later requests
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

  it('/api/v1/posts (POST) - Create a post', () => {
    const postData = {
      caption: `Testing E2E #test #circlesfera @${testUser.username}`,
      media: [
        {
          url: 'https://res.cloudinary.com/dummy/image/upload/v1/test.jpg',
          type: 'image',
        },
      ],
    };

    return request(app.getHttpServer())
      .post('/api/v1/posts')
      .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(postData)
      .expect(201)
      .expect((res: request.Response) => {
        expect(res.body.caption).toBe(postData.caption);
        expect(res.body.media[0].url).toBe(postData.media[0].url);
      });
  });

  it('/api/v1/posts (GET) - Find the created post in feed', () => {
    return request(app.getHttpServer())
      .get('/api/v1/posts')
      .expect(200)
      .expect((res: request.Response) => {
        const posts = res.body.data;
        expect(Array.isArray(posts)).toBe(true);
      });
  });
});
