import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// The account language: stored at sign-up from the app, returned with the
// own profile, and changeable before the email is verified.
describe('Account language (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let csrfToken: string;
  let csrfCookie: string;

  const id = uniqueSuffix();
  const englishUser = {
    email: `locale_en_${id}@example.com`,
    password: 'Password123!',
    username: `locale_en_${id}`,
    dateOfBirth: '1990-01-15',
    locale: 'en',
  };
  const defaultUser = {
    email: `locale_def_${id}@example.com`,
    password: 'Password123!',
    username: `locale_def_${id}`,
    dateOfBirth: '1990-01-15',
  };
  const emails = [englishUser.email, defaultUser.email];

  const register = (body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(body);

  const sessionCookies = (res: request.Response) =>
    ((res.get('Set-Cookie') as string[]) || []).map((c) => c.split(';')[0]);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { in: emails } } });

    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    csrfToken = csrfRes.body.csrfToken;
    csrfCookie =
      ((csrfRes.get('Set-Cookie') as string[]) || []).find((c) =>
        c.startsWith('x-csrf-token='),
      ) || '';
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('sign-up stores the app language, and Spanish when none is sent', async () => {
    await register(englishUser).expect(201);
    await register(defaultUser).expect(201);

    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true, locale: true },
    });
    expect(Object.fromEntries(users.map((u) => [u.email, u.locale]))).toEqual({
      [englishUser.email]: 'en',
      [defaultUser.email]: 'es',
    });
  });

  it('refuses an unsupported or regional language tag at sign-up', async () => {
    await register({
      ...defaultUser,
      email: `locale_gb_${id}@example.com`,
      username: `locale_gb_${id}`,
      locale: 'en-GB',
    }).expect(400);
    await register({
      ...defaultUser,
      email: `locale_fr_${id}@example.com`,
      username: `locale_fr_${id}`,
      locale: 'fr',
    }).expect(400);
  });

  it('an unverified account can read and change its language', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ identifier: defaultUser.email, password: defaultUser.password })
      .expect(200);
    const cookies = [csrfCookie, ...sessionCookies(login)];

    const me = await request(app.getHttpServer())
      .get('/api/v1/profiles/me')
      .set('Cookie', cookies)
      .expect(200);
    expect(me.body.user.locale).toBe('es');

    const updated = await request(app.getHttpServer())
      .put('/api/v1/users/me/locale')
      .set('Cookie', cookies)
      .set('x-csrf-token', csrfToken)
      .send({ locale: 'en' })
      .expect(200);
    expect(updated.body).toEqual({ locale: 'en' });

    await request(app.getHttpServer())
      .put('/api/v1/users/me/locale')
      .set('Cookie', cookies)
      .set('x-csrf-token', csrfToken)
      .send({ locale: 'de' })
      .expect(400);

    const stored = await prisma.user.findUnique({
      where: { email: defaultUser.email },
      select: { locale: true },
    });
    expect(stored?.locale).toBe('en');
  });

  it('changing the language needs a session', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/users/me/locale')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ locale: 'en' })
      .expect(401);
  });
});
