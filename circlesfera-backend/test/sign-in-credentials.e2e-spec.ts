import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// The credentials live on the sign-in only; the account holds none.
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

  it('the account has no credential columns left', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users'
    `;
    const names = columns.map((c) => c.column_name);
    expect(names).toContain('email');
    for (const gone of [
      'password',
      'emailVerified',
      'verificationToken',
      'isTwoFactorEnabled',
      'twoFactorSecret',
      'resetToken',
      'resetTokenExpires',
      'passwordResetRequiredAt',
    ]) {
      expect(names).not.toContain(gone);
    }
  });
});
