import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// The app writes the credentials on the sign-in only. The account keeps an
// old copy only while it is being retired, and a new account has none.
describe('Sign-in credentials (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let csrfToken: string;
  let csrfCookie: string;

  const id = uniqueSuffix();
  const account = {
    email: `signin_${id}@example.com`,
    password: 'Password123!',
    username: `signin_${id}`,
    dateOfBirth: '1990-01-15',
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
    await prisma.user.deleteMany({ where: { email: account.email } });

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
    await prisma.user.deleteMany({ where: { email: account.email } });
    await app.close();
  });

  it('signing up creates one sign-in with the credentials, and the Profile enters with it', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(account)
      .expect(201);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: account.email },
      select: { id: true },
    });
    const signIns = await prisma.signIn.findMany({
      where: { userId: user.id },
      omit: { password: false, verificationToken: false },
    });
    expect(signIns).toHaveLength(1);
    expect(signIns[0].email).toBe(account.email);
    expect(signIns[0].password).toMatch(/^\$argon2/);
    expect(signIns[0].verificationToken).toBeTruthy();
    expect(signIns[0].emailVerified).toBeNull();

    const profiles = await prisma.profile.findMany({
      where: { userId: user.id },
      select: { signInId: true },
    });
    expect(profiles).toEqual([{ signInId: signIns[0].id }]);
    // The account itself holds no credentials.
    const own = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      omit: { password: false, verificationToken: false },
    });
    expect(own.password).toBeNull();
    expect(own.verificationToken).toBeNull();

    // A later write on the sign-in gives the account no copy either.
    await prisma.signIn.update({
      where: { id: signIns[0].id },
      data: { emailVerified: new Date(), verificationToken: null },
    });
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      omit: { password: false },
    });
    expect(after.password).toBeNull();
  });

  it('a second Profile of the account enters with the same sign-in', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: account.email },
      select: { id: true },
    });

    const second = await prisma.profile.create({
      data: { userId: user.id, username: `signin_b_${id}` },
      select: { signInId: true },
    });

    const signIn = await prisma.signIn.findFirstOrThrow({
      where: { userId: user.id },
      select: { id: true },
    });
    expect(second.signInId).toBe(signIn.id);
  });

  it('an account written with a password, as an older version of the app does during a deploy, still gets its sign-in', async () => {
    const email = `signin_old_${id}@example.com`;
    try {
      const old = await prisma.user.create({
        data: { email, password: 'hash-from-an-older-app' },
        select: { id: true },
      });

      const signIn = await prisma.signIn.findFirstOrThrow({
        where: { userId: old.id },
        omit: { password: false },
      });
      expect(signIn.email).toBe(email);
      expect(signIn.password).toBe('hash-from-an-older-app');
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });
});
