import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import {
  AuthService,
  REFRESH_RETRY_GRACE_MS,
} from '../src/auth/auth.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// ADR-0032 against the real database: the renewal locks the session's tokens
// (SELECT ... FOR UPDATE), forgives only the retry of a lost answer, and ends
// the session for anything else.
describe('Refresh retried after a lost answer (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let userId: string;

  const id = uniqueSuffix();
  const account = {
    email: `refresh_${id}@example.com`,
    password: 'Password123!',
    username: `refresh_${id}`,
    dateOfBirth: '1990-01-15',
  };

  // A new session: its first refresh token and its family.
  async function openSession() {
    const { refreshToken } = await auth.generateTokens(userId, account.email);
    const family = await prisma.refreshToken.findFirstOrThrow({
      where: { userId, isRevoked: false },
      orderBy: { createdAt: 'desc' },
      select: { familyId: true },
    });
    return { token: refreshToken, familyId: family.familyId as string };
  }

  const renew = (refreshToken: string) => auth.refreshToken({ refreshToken });

  const liveTokens = (familyId: string) =>
    prisma.refreshToken.count({
      where: { userId, familyId, isRevoked: false },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    await prisma.user.deleteMany({ where: { email: account.email } });

    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    const csrfCookie =
      ((csrfRes.get('Set-Cookie') as string[]) || []).find((c) =>
        c.startsWith('x-csrf-token='),
      ) || '';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfRes.body.csrfToken)
      .send(account)
      .expect(201);
    userId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: account.email },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: account.email } });
    await app.close();
  });

  it('renews again with the replaced token, then ends the session for a second replay', async () => {
    const { token: first, familyId } = await openSession();
    await renew(first); // its answer is "lost": the person still holds `first`

    const retried = await renew(first);
    expect(retried.refreshToken).toBeTruthy();
    // The token the lost answer carried was withdrawn; only the new one lives.
    expect(await liveTokens(familyId)).toBe(1);

    // The retry renewed the session, so `first` is now plain replay.
    await expect(renew(first)).rejects.toThrow('Refresh token reuse detected');
    expect(
      await prisma.refreshToken.count({ where: { userId, familyId } }),
    ).toBe(0);
  });

  it('gives a session to at most one of several replays sent together', async () => {
    const { token: first, familyId } = await openSession();
    await renew(first);

    const results = await Promise.allSettled([
      renew(first),
      renew(first),
      renew(first),
    ]);

    expect(
      results.filter((r) => r.status === 'fulfilled').length,
    ).toBeLessThanOrEqual(1);
    expect(await liveTokens(familyId)).toBeLessThanOrEqual(1);
  });

  // Two requests of the same page renewing at once: the second waits for the
  // first, and its retry withdraws the token the first wrote.
  it('leaves one live token after two renewals of the same token at once', async () => {
    const { token: first, familyId } = await openSession();

    const results = await Promise.allSettled([renew(first), renew(first)]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await liveTokens(familyId)).toBe(1);
  });

  // Signing out waits for a renewal in progress and deletes the token it
  // wrote; a renewal that comes second finds the session closed.
  it('leaves no token of a session signed out while it renews', async () => {
    const { token: first, familyId } = await openSession();

    await Promise.allSettled([renew(first), auth.logout(userId, first)]);

    expect(
      await prisma.refreshToken.count({ where: { userId, familyId } }),
    ).toBe(0);
  });

  it('ends the session for a replaced token once the window has passed', async () => {
    const { token: first, familyId } = await openSession();
    await renew(first);
    await prisma.refreshToken.updateMany({
      where: { userId, familyId, isRevoked: true },
      data: {
        revokedAt: new Date(Date.now() - REFRESH_RETRY_GRACE_MS - 60_000),
      },
    });

    await expect(renew(first)).rejects.toThrow('Refresh token reuse detected');
    expect(
      await prisma.refreshToken.count({ where: { userId, familyId } }),
    ).toBe(0);
  });
});
