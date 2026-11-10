import { ErrorCode } from '@circlesfera/shared';
import { describe, expect, it, vi } from 'vitest';
import { assertAdultPayer } from './adult-payer.policy.js';

const db = (user: object | null) =>
  ({ user: { findUnique: vi.fn().mockResolvedValue(user) } }) as any;

// A date of birth this many years ago, a little past the birthday.
const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 2);
  return d;
};

const verified = (over: object = {}) => ({
  identityVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  dateOfBirth: yearsAgo(30),
  dateOfBirthVerified: true,
  ...over,
});

describe('assertAdultPayer', () => {
  it('lets an adult with an identity verified by document pay', async () => {
    const reader = db(verified());
    await expect(assertAdultPayer(reader, 'u1')).resolves.toBeUndefined();
    expect(reader.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: {
        identityVerifiedAt: true,
        dateOfBirth: true,
        dateOfBirthVerified: true,
      },
    });
  });

  it.each([
    ['under 18', verified({ dateOfBirth: yearsAgo(17) })],
    [
      'with a date of birth only typed at sign-up',
      verified({ dateOfBirthVerified: false }),
    ],
    ['with no verified identity', verified({ identityVerifiedAt: null })],
    ['gone', null],
  ])('refuses someone %s, saying the age', async (_case, user) => {
    await expect(assertAdultPayer(db(user), 'u1')).rejects.toMatchObject({
      errorCode: ErrorCode.PAYER_UNDER_AGE,
      response: expect.objectContaining({ details: { minAge: 18 } }),
    });
  });
});
