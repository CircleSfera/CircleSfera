import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionEmailVerified } from './sign-in-lookup.js';

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
