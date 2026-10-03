import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { uniqueSuffix } from '../utils/unique-id.js';

// Search and SEO handlers take `@Query('q') query: string` without a DTO.
// What keeps a repeated (?q=a&q=b) or nested (?q[x]=1) parameter from
// reaching them as an array or object is the global ValidationPipe with
// `transform: true`, which coerces values for `string` parameters. This spec
// pins that behaviour: if the coercion is removed, these requests reach
// string methods with an array and fail with 500.
describe('Query parameters typed as string are coerced (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie = '';
  let csrf = '';
  const id = uniqueSuffix();
  const email = `qcoerce_${id}@example.com`;

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
    cookie =
      ((csrfRes.get('Set-Cookie') as string[]) || []).find((c) =>
        c.startsWith('x-csrf-token='),
      ) || '';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [cookie])
      .set('x-csrf-token', csrf)
      .send({
        email,
        password: 'Password123!',
        username: `qcoerce_${id}`,
        dateOfBirth: '1990-01-01',
      })
      .expect(201);
    await prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [cookie])
      .set('x-csrf-token', csrf)
      .send({ identifier: email, password: 'Password123!' })
      .expect(200);
    cookie = [cookie, ...((login.get('Set-Cookie') as string[]) || [])].join(
      '; ',
    );
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email } });
    if (app) await app.close();
  });

  it.each([
    '/search?q=ab&q=cd',
    '/search?q[x]=abc',
    '/search/posts?q=ab&q=cd',
    '/search/users?q=ab&q=cd',
    '/search/ai?q=abc&q=def',
    '/search/ai/profiles?q=abc&q=def',
  ])('answers %s without a server error', async (route) => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1${route}`)
      .set('Cookie', [cookie])
      .set('x-csrf-token', csrf);
    expect(res.status).toBe(200);
  });

  it.each(['/og?path=/a&path=/b', '/og?path[x]=/a'])(
    'answers %s without a server error',
    async (route) => {
      const res = await request(app.getHttpServer()).get(`/api/v1${route}`);
      expect(res.status).toBe(200);
    },
  );
});
