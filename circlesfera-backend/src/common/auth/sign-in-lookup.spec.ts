import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emailForPerson,
  emailForProfile,
  sessionEmailVerified,
} from './sign-in-lookup.js';

describe('sessionEmailVerified', () => {
  const prisma = { signIn: { findFirst: vi.fn() } };
  const ask = (owner: {
    userId: string;
    signInId?: string | null;
    profileId?: string | null;
  }) => sessionEmailVerified(prisma as never, owner);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('looks at the sign-in that opened the session, inside its account, before anything else', async () => {
    prisma.signIn.findFirst.mockResolvedValue({ emailVerified: new Date() });

    await expect(
      ask({ userId: 'u-1', signInId: 's-1', profileId: 'p-1' }),
    ).resolves.toBe(true);

    expect(prisma.signIn.findFirst.mock.calls[0][0].where).toEqual({
      userId: 'u-1',
      id: 's-1',
    });
  });

  it('looks at the sign-in of the Profile in use, inside the account of the session', async () => {
    prisma.signIn.findFirst.mockResolvedValue({ emailVerified: new Date() });

    await expect(ask({ userId: 'u-1', profileId: 'p-1' })).resolves.toBe(true);

    expect(prisma.signIn.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u-1', profiles: { some: { id: 'p-1' } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { emailVerified: true },
    });
  });

  it.each([undefined, null])(
    'looks at the first sign-in of the account when the session names no Profile (%s)',
    async (profileId) => {
      prisma.signIn.findFirst.mockResolvedValue({ emailVerified: new Date() });

      await expect(ask({ userId: 'u-1', profileId })).resolves.toBe(true);

      expect(prisma.signIn.findFirst.mock.calls[0][0].where).toEqual({
        userId: 'u-1',
      });
    },
  );

  it('is false for an email not yet verified', async () => {
    prisma.signIn.findFirst.mockResolvedValue({ emailVerified: null });
    await expect(ask({ userId: 'u-1' })).resolves.toBe(false);
  });

  it('is false when there is no sign-in: never verified by default', async () => {
    prisma.signIn.findFirst.mockResolvedValue(null);
    await expect(ask({ userId: 'u-1', profileId: 'p-1' })).resolves.toBe(false);
  });
});

describe('where an email goes', () => {
  const prisma = {
    profile: { findUnique: vi.fn() },
    signIn: { findFirst: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.signIn.findFirst.mockResolvedValue({ email: 'main@example.com' });
  });

  it('about a Profile: to the email of its sign-in once that email is verified', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      userId: 'u-1',
      signIn: { email: 'shop@example.com', emailVerified: new Date() },
    });

    await expect(emailForProfile(prisma as never, 'p-1')).resolves.toBe(
      'shop@example.com',
    );
    expect(prisma.signIn.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['is not verified yet', { email: 'typo@example.com', emailVerified: null }],
    ['does not exist', null],
  ])(
    'about a Profile whose sign-in %s: to the first sign-in of the account, never to the unverified address',
    async (_case, signIn) => {
      prisma.profile.findUnique.mockResolvedValue({ userId: 'u-1', signIn });

      await expect(emailForProfile(prisma as never, 'p-1')).resolves.toBe(
        'main@example.com',
      );
      expect(prisma.signIn.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u-1' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { email: true },
      });
    },
  );

  it('about a Profile that does not exist: nowhere', async () => {
    prisma.profile.findUnique.mockResolvedValue(null);
    await expect(emailForProfile(prisma as never, 'gone')).resolves.toBeNull();
  });

  it('about the person: to the first sign-in of the account, or nowhere without one', async () => {
    await expect(emailForPerson(prisma as never, 'u-1')).resolves.toBe(
      'main@example.com',
    );
    prisma.signIn.findFirst.mockResolvedValue(null);
    await expect(emailForPerson(prisma as never, 'u-1')).resolves.toBeNull();
  });
});
