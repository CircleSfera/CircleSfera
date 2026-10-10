import { ErrorCode } from '@circlesfera/shared';
import * as argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NEW_SIGN_INS_PER_DAY,
  NEW_SIGN_INS_PER_HOUR,
  SignInsService,
} from './sign-ins.service.js';

describe('SignInsService', () => {
  const tx = {
    signIn: { create: vi.fn(), deleteMany: vi.fn() },
    profile: { update: vi.fn() },
  };
  const prisma = {
    profile: { findMany: vi.fn(), findFirst: vi.fn() },
    signIn: { findFirst: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (run: (t: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const email = { sendVerificationEmail: vi.fn() };
  const passkeys = { provesSignIn: vi.fn() };
  const counters = new Map<string, number>();
  const cache = {
    get: vi.fn(async (key: string) => counters.get(key)),
    set: vi.fn(async (key: string, value: number) => {
      counters.set(key, value);
    }),
  };
  const service = new SignInsService(
    prisma as never,
    email as never,
    passkeys as never,
    cache as never,
  );

  const session = { userId: 'u-1', signInId: 's-shared' };
  const PASSWORD = 'Current-Password-1';
  let sessionSignIn: { id: string; email: string; password: string };
  const proof = { currentPassword: PASSWORD };
  const own = {
    profileId: 'p-2',
    email: '  Shop@Example.com ',
    password: 'New-Password-1',
  };
  const codeOf = async (run: Promise<unknown>) =>
    run.then(
      () => 'no error',
      (error: { errorCode?: string; getStatus?: () => number }) =>
        `${error.getStatus?.()} ${error.errorCode}`,
    );

  beforeEach(async () => {
    vi.clearAllMocks();
    counters.clear();
    sessionSignIn = {
      id: 's-shared',
      email: 'main@example.com',
      password: await argon2.hash(PASSWORD),
    };
    prisma.signIn.findFirst.mockImplementation(async () => sessionSignIn);
    prisma.signIn.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.profile.findMany.mockResolvedValue([]);
    // The Profile shares its sign-in with another one.
    prisma.profile.findFirst.mockResolvedValue({
      id: 'p-2',
      signInId: 's-shared',
      signIn: { _count: { profiles: 2 } },
    });
    tx.signIn.create.mockResolvedValue({ id: 's-new' });
  });

  describe('list', () => {
    it('says, for each Profile of the person, how it signs in', async () => {
      prisma.profile.findMany.mockResolvedValue([
        {
          id: 'p-1',
          username: 'ana',
          signIn: {
            id: 's-shared',
            email: 'main@example.com',
            emailVerified: new Date(),
            _count: { profiles: 2 },
          },
        },
        {
          id: 'p-3',
          username: 'ana.shop',
          signIn: {
            id: 's-own',
            email: 'shop@example.com',
            emailVerified: null,
            _count: { profiles: 1 },
          },
        },
      ]);

      expect(await service.list(session)).toEqual([
        {
          profileId: 'p-1',
          username: 'ana',
          signIn: {
            id: 's-shared',
            email: 'main@example.com',
            emailVerified: true,
            shared: true,
            current: true,
          },
        },
        {
          profileId: 'p-3',
          username: 'ana.shop',
          signIn: {
            id: 's-own',
            email: 'shop@example.com',
            emailVerified: false,
            shared: false,
            current: false,
          },
        },
      ]);
      // Only the Profiles of the person who asks.
      expect(prisma.profile.findMany.mock.calls[0][0].where).toEqual({
        userId: 'u-1',
      });
      // Never a password or a token.
      expect(
        Object.keys(
          prisma.profile.findMany.mock.calls[0][0].select.signIn.select,
        ),
      ).toEqual(['id', 'email', 'emailVerified', '_count']);
    });
  });

  describe('proof of who asks', () => {
    it('refuses without a password or a passkey, before anything is looked at', async () => {
      expect(await codeOf(service.giveOwn(session, own, {}))).toBe(
        `400 ${ErrorCode.SIGN_IN_PROOF_REQUIRED}`,
      );
      expect(prisma.profile.findFirst).not.toHaveBeenCalled();
    });

    it('refuses a wrong password with 400: not 401, which reads as an expired session, nor 403, which the app sends again', async () => {
      expect(
        await codeOf(
          service.giveOwn(session, own, { currentPassword: 'wrong' }),
        ),
      ).toBe(`400 ${ErrorCode.SIGN_IN_PROOF_INVALID}`);
      expect(tx.signIn.create).not.toHaveBeenCalled();
    });

    it('checks the password of the sign-in of the session, inside its account', async () => {
      await service.giveOwn(session, own, proof);

      expect(prisma.signIn.findFirst.mock.calls[0][0].where).toEqual({
        userId: 'u-1',
        id: 's-shared',
      });
    });

    it('accepts a passkey of the sign-in of the session, and refuses one that does not prove it', async () => {
      const assertion = { id: 'cred-1' };
      passkeys.provesSignIn.mockResolvedValueOnce(true);
      await service.giveOwn(session, own, { passkeyAssertion: assertion });
      expect(passkeys.provesSignIn).toHaveBeenCalledWith(
        { userId: 'u-1', signInId: 's-shared', email: 'main@example.com' },
        assertion,
      );

      passkeys.provesSignIn.mockResolvedValueOnce(false);
      expect(
        await codeOf(
          service.share(
            session,
            { profileId: 'p-2', signInId: 's-other' },
            { passkeyAssertion: assertion },
          ),
        ),
      ).toBe(`400 ${ErrorCode.SIGN_IN_PROOF_INVALID}`);
    });

    it('refuses when the session has no sign-in', async () => {
      prisma.signIn.findFirst.mockResolvedValue(null);
      expect(await codeOf(service.giveOwn(session, own, proof))).toBe(
        `400 ${ErrorCode.SIGN_IN_PROOF_INVALID}`,
      );
    });
  });

  describe('giving a Profile its own sign-in', () => {
    it('creates the sign-in in the account, points the Profile to it and sends the verification to the new address', async () => {
      await service.giveOwn(session, own, proof);

      const created = tx.signIn.create.mock.calls[0][0].data;
      expect(created).toMatchObject({
        userId: 'u-1',
        email: 'shop@example.com',
        verificationToken: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      // The password is stored hashed, never as typed.
      expect(created.password).toMatch(/^\$argon2/);
      expect(await argon2.verify(created.password, own.password)).toBe(true);
      // It starts plain: no second step, not verified.
      expect(created).not.toHaveProperty('isTwoFactorEnabled');
      expect(created).not.toHaveProperty('emailVerified');

      expect(tx.profile.update).toHaveBeenCalledWith({
        where: { id: 'p-2' },
        data: { signInId: 's-new' },
      });
      expect(email.sendVerificationEmail).toHaveBeenCalledWith(
        'shop@example.com',
        created.verificationToken,
      );
    });

    it('looks for the Profile among those of the person, and answers not found for one of someone else', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);

      expect(await codeOf(service.giveOwn(session, own, proof))).toBe(
        `404 ${ErrorCode.SIGN_IN_NOT_FOUND}`,
      );
      expect(prisma.profile.findFirst.mock.calls[0][0].where).toEqual({
        id: 'p-2',
        userId: 'u-1',
      });
      expect(tx.signIn.create).not.toHaveBeenCalled();
    });

    it.each([
      ['uses a sign-in no other Profile uses', { _count: { profiles: 1 } }],
      ['has no sign-in', null],
    ])('refuses a Profile that %s', async (_case, signIn) => {
      prisma.profile.findFirst.mockResolvedValue({ id: 'p-2', signIn });

      expect(await codeOf(service.giveOwn(session, own, proof))).toBe(
        `409 ${ErrorCode.SIGN_IN_ALREADY_OWN}`,
      );
      expect(tx.signIn.create).not.toHaveBeenCalled();
    });

    it.each([
      ['a sign-in', 'signIn'],
      ['an account', 'user'],
    ] as const)(
      'refuses an email that %s already holds, without saying whose',
      async (_case, holder) => {
        prisma[holder].findUnique.mockResolvedValue({ id: 'someone' });

        const run = service.giveOwn(session, own, proof);
        expect(await codeOf(run)).toBe(`409 ${ErrorCode.SIGN_IN_EMAIL_TAKEN}`);
        await run.catch((error: { details?: unknown }) => {
          expect(error.details).toBeUndefined();
        });
        expect(prisma.signIn.findUnique.mock.calls[0][0].where).toEqual({
          email: 'shop@example.com',
        });
        expect(tx.signIn.create).not.toHaveBeenCalled();
        expect(email.sendVerificationEmail).not.toHaveBeenCalled();
      },
    );

    it('answers email taken when another request took the address a moment before', async () => {
      tx.signIn.create.mockRejectedValueOnce(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );

      expect(await codeOf(service.giveOwn(session, own, proof))).toBe(
        `409 ${ErrorCode.SIGN_IN_EMAIL_TAKEN}`,
      );
      expect(email.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('lets one new sign-in through an hour and five a day, and says when to try again', async () => {
      expect(NEW_SIGN_INS_PER_HOUR).toBe(1);
      expect(NEW_SIGN_INS_PER_DAY).toBe(5);

      await service.giveOwn(session, own, proof);
      const second = service.giveOwn(session, own, proof);
      expect(await codeOf(second)).toBe(
        `429 ${ErrorCode.SIGN_IN_LIMIT_REACHED}`,
      );
      await second.catch((error: { details?: unknown }) => {
        expect(error.details).toEqual({ retryAfterSeconds: 3600 });
      });
      expect(tx.signIn.create).toHaveBeenCalledTimes(1);

      // An hour later, with five already made that day.
      counters.set('sign-ins:new:hour:u-1', 0);
      counters.set('sign-ins:new:day:u-1', 5);
      const sixth = service.giveOwn(session, own, proof);
      expect(await codeOf(sixth)).toBe(
        `429 ${ErrorCode.SIGN_IN_LIMIT_REACHED}`,
      );
      await sixth.catch((error: { details?: unknown }) => {
        expect(error.details).toEqual({ retryAfterSeconds: 86400 });
      });
    });

    it('counts a sign-in per person, and only when it was made', async () => {
      prisma.signIn.findUnique.mockResolvedValueOnce({ id: 'someone' });
      await service.giveOwn(session, own, proof).catch(() => undefined);
      expect(counters.size).toBe(0);

      await service.giveOwn(session, own, proof);
      expect(counters.get('sign-ins:new:hour:u-1')).toBe(1);
      expect(counters.get('sign-ins:new:day:u-1')).toBe(1);
    });
  });

  describe('going back to sharing', () => {
    const back = { profileId: 'p-2', signInId: 's-shared' };
    beforeEach(() => {
      prisma.profile.findFirst.mockResolvedValue({
        id: 'p-2',
        signInId: 's-own',
      });
    });

    it('points the Profile to the sign-in chosen and removes the one left with no Profile', async () => {
      await service.share(session, back, proof);

      expect(tx.profile.update).toHaveBeenCalledWith({
        where: { id: 'p-2' },
        data: { signInId: 's-shared' },
      });
      // Removed only inside the account, and only if no Profile uses it.
      expect(tx.signIn.deleteMany).toHaveBeenCalledWith({
        where: { id: 's-own', userId: 'u-1', profiles: { none: {} } },
      });
    });

    it('looks for the sign-in chosen inside the account: one of someone else is not found', async () => {
      // The first read is the proof; the second is the sign-in chosen.
      prisma.signIn.findFirst
        .mockImplementationOnce(async () => sessionSignIn)
        .mockImplementationOnce(async () => null);

      expect(
        await codeOf(
          service.share(
            session,
            { profileId: 'p-2', signInId: 's-of-another' },
            proof,
          ),
        ),
      ).toBe(`404 ${ErrorCode.SIGN_IN_NOT_FOUND}`);
      expect(prisma.signIn.findFirst.mock.calls[1][0].where).toEqual({
        id: 's-of-another',
        userId: 'u-1',
      });
      expect(tx.profile.update).not.toHaveBeenCalled();
    });

    it('answers not found for a Profile of someone else', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);

      expect(await codeOf(service.share(session, back, proof))).toBe(
        `404 ${ErrorCode.SIGN_IN_NOT_FOUND}`,
      );
      expect(tx.profile.update).not.toHaveBeenCalled();
    });

    it('changes nothing when the Profile already uses that sign-in', async () => {
      prisma.profile.findFirst.mockResolvedValue({
        id: 'p-2',
        signInId: 's-shared',
      });

      await service.share(session, back, proof);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.signIn.deleteMany).not.toHaveBeenCalled();
    });
  });
});
