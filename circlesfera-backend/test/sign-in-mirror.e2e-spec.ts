import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// Every account has a sign-in holding a copy of its credentials, and every
// Profile points to one. While sign-in still reads the account, the database
// keeps the copy equal on every write, whatever code makes it.
describe('Sign-in copy of the account credentials (e2e)', () => {
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
  const newEmail = `signin_new_${id}@example.com`;

  const credentialFields = {
    email: true,
    password: true,
    emailVerified: true,
    verificationToken: true,
    resetToken: true,
    resetTokenExpires: true,
    passwordResetRequiredAt: true,
    isTwoFactorEnabled: true,
    twoFactorSecret: true,
  } as const;

  /** The credentials as the account holds them and as its sign-in holds them. */
  async function bothCopies() {
    const user = await prisma.user.findFirstOrThrow({
      where: { email: { in: [account.email, newEmail] } },
      // The secrets are left out of every read unless asked for.
      omit: {
        password: false,
        twoFactorSecret: false,
        resetToken: false,
        verificationToken: false,
      },
    });
    const signIns = await prisma.signIn.findMany({
      where: { userId: user.id },
      select: credentialFields,
    });
    const onUser = Object.fromEntries(
      Object.keys(credentialFields).map((field) => [
        field,
        user[field as keyof typeof user],
      ]),
    );
    return { user, signIns, onUser };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({
      where: { email: { in: [account.email, newEmail] } },
    });

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
    await prisma.user.deleteMany({
      where: { email: { in: [account.email, newEmail] } },
    });
    await app.close();
  });

  it('signing up creates one sign-in with the credentials of the account, and the Profile enters with it', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(account)
      .expect(201);

    const { user, signIns, onUser } = await bothCopies();
    expect(signIns).toHaveLength(1);
    expect(signIns[0]).toEqual(onUser);
    expect(signIns[0].password).toMatch(/^\$argon2/);

    const profiles = await prisma.profile.findMany({
      where: { userId: user.id },
      select: { signInId: true, signIn: { select: { userId: true } } },
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0].signIn?.userId).toBe(user.id);
  });

  it('every write to the credentials of the account reaches its sign-in', async () => {
    const { user } = await bothCopies();

    const writes = [
      { password: 'another-hash' },
      { resetToken: `reset_${id}`, resetTokenExpires: new Date() },
      { resetToken: null, resetTokenExpires: null },
      { emailVerified: new Date(), verificationToken: null },
      { isTwoFactorEnabled: true, twoFactorSecret: 'encrypted-secret' },
      { isTwoFactorEnabled: false, twoFactorSecret: null },
      { passwordResetRequiredAt: new Date() },
      { email: newEmail },
    ];
    for (const data of writes) {
      await prisma.user.update({ where: { id: user.id }, data });
      const { signIns, onUser } = await bothCopies();
      expect(signIns).toHaveLength(1);
      expect(signIns[0]).toEqual(onUser);
    }
  });

  it('a write that touches no credential leaves the sign-in as it was', async () => {
    const { user } = await bothCopies();
    const before = await prisma.signIn.findFirstOrThrow({
      where: { userId: user.id },
      select: { updatedAt: true },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { isOnline: true },
    });

    const after = await prisma.signIn.findFirstOrThrow({
      where: { userId: user.id },
      select: { updatedAt: true },
    });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('a second Profile of the account enters with the same sign-in', async () => {
    const { user } = await bothCopies();

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

  it('every write to the credentials of the first sign-in reaches its account', async () => {
    const { user } = await bothCopies();
    const first = await prisma.signIn.findFirstOrThrow({
      where: { userId: user.id },
      select: { id: true },
    });

    const writes = [
      { password: 'hash-written-on-the-sign-in' },
      { resetToken: `reset_b_${id}`, resetTokenExpires: new Date() },
      { resetToken: null, resetTokenExpires: null },
      { emailVerified: null, verificationToken: `verify_b_${id}` },
      { emailVerified: new Date(), verificationToken: null },
      { isTwoFactorEnabled: true, twoFactorSecret: 'encrypted-secret-b' },
      { isTwoFactorEnabled: false, twoFactorSecret: null },
      { passwordResetRequiredAt: null },
    ];
    for (const data of writes) {
      await prisma.signIn.update({ where: { id: first.id }, data });
      const { signIns, onUser } = await bothCopies();
      expect(signIns).toHaveLength(1);
      expect(signIns[0]).toEqual(onUser);
    }
  });

  it('a second sign-in of the account keeps its own credentials, in both directions', async () => {
    const { user, onUser: before } = await bothCopies();
    const second = await prisma.signIn.create({
      data: {
        userId: user.id,
        email: `signin_second_${id}@example.com`,
        password: 'hash-of-the-second',
      },
      select: { id: true },
    });
    const ofSecond = () =>
      prisma.signIn.findUniqueOrThrow({
        where: { id: second.id },
        select: credentialFields,
      });

    // Writing the second sign-in does not touch the account.
    await prisma.signIn.update({
      where: { id: second.id },
      data: {
        password: 'another-hash-of-the-second',
        emailVerified: new Date(),
        isTwoFactorEnabled: true,
        twoFactorSecret: 'secret-of-the-second',
      },
    });
    expect((await bothCopies()).onUser).toEqual(before);

    // Writing the account reaches its first sign-in and not the second.
    const secondBefore = await ofSecond();
    await prisma.user.update({
      where: { id: user.id },
      data: { password: 'hash-written-on-the-account' },
    });
    expect(await ofSecond()).toEqual(secondBefore);
    const first = await prisma.signIn.findFirstOrThrow({
      where: { userId: user.id, id: { not: second.id } },
      omit: { password: false },
    });
    expect(first.password).toBe('hash-written-on-the-account');

    await prisma.signIn.delete({ where: { id: second.id } });
  });

  it('the database refuses a Profile on a sign-in of another account', async () => {
    const { user } = await bothCopies();
    const stranger = await prisma.user.create({
      data: {
        email: `signin_stranger_${id}@example.com`,
        password: 'hash-of-the-stranger',
        dateOfBirth: new Date('1990-01-15'),
        inviteCode: `S${id}`.slice(0, 12).toUpperCase(),
      },
      select: { id: true, signIns: { select: { id: true } } },
    });
    const mine = await prisma.profile.findFirstOrThrow({
      where: { userId: user.id },
      select: { id: true, signInId: true },
    });

    await expect(
      prisma.profile.update({
        where: { id: mine.id },
        data: { signInId: stranger.signIns[0].id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.profile.create({
        data: {
          userId: user.id,
          username: `signin_c_${id}`,
          signInId: stranger.signIns[0].id,
        },
      }),
    ).rejects.toThrow();

    const after = await prisma.profile.findUniqueOrThrow({
      where: { id: mine.id },
      select: { signInId: true },
    });
    expect(after.signInId).toBe(mine.signInId);
    await prisma.user.delete({ where: { id: stranger.id } });
  });

  it('no account is left without a sign-in, and no Profile without one', async () => {
    const [accountsWithout, profilesWithout] = await Promise.all([
      prisma.user.count({ where: { signIns: { none: {} } } }),
      prisma.profile.count({ where: { signInId: null } }),
    ]);
    expect(accountsWithout).toBe(0);
    expect(profilesWithout).toBe(0);
  });

  it('deleting the account removes its sign-in', async () => {
    const { user } = await bothCopies();

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.signIn.count({ where: { userId: user.id } })).toBe(0);
  });
});
