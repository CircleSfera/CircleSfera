import { ErrorCode } from '@circlesfera/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  assertAdultPayer,
  assertIdentityForBadge,
} from './adult-payer.policy.js';

const db = (user: object | null) =>
  ({ user: { findUnique: vi.fn().mockResolvedValue(user) } }) as any;

// A date of birth this many years ago, a little past the birthday.
const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 2);
  return d;
};

describe('assertAdultPayer', () => {
  it('lets an adult pay by the date of birth given at sign-up, with no document', async () => {
    const reader = db({ dateOfBirth: yearsAgo(30) });
    await expect(assertAdultPayer(reader, 'u1')).resolves.toBeUndefined();
    expect(reader.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { dateOfBirth: true },
    });
  });

  it.each([
    ['under 18', { dateOfBirth: yearsAgo(17) }],
    ['with no date of birth', { dateOfBirth: null }],
    ['gone', null],
  ])('refuses someone %s, saying the age', async (_case, user) => {
    await expect(assertAdultPayer(db(user), 'u1')).rejects.toMatchObject({
      errorCode: ErrorCode.PAYER_UNDER_AGE,
      response: expect.objectContaining({ details: { minAge: 18 } }),
    });
  });
});

describe('assertIdentityForBadge', () => {
  it('asks nothing for what carries no verified badge, as the add-on', async () => {
    const reader = db(null);
    await expect(
      assertIdentityForBadge(reader, 'u1', ['studio_pro']),
    ).resolves.toBeUndefined();
    expect(reader.user.findUnique).not.toHaveBeenCalled();
  });

  it('lets a person with a verified identity buy a plan with the badge', async () => {
    const reader = db({ identityVerifiedAt: new Date('2026-01-01') });
    await expect(
      assertIdentityForBadge(reader, 'u1', ['verified_badge']),
    ).resolves.toBeUndefined();
    expect(reader.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { identityVerifiedAt: true },
    });
  });

  it.each([
    ['with no verified identity', { identityVerifiedAt: null }],
    ['gone', null],
  ])(
    'refuses a plan with the badge to someone %s, so the app offers the verification',
    async (_case, user) => {
      await expect(
        assertIdentityForBadge(db(user), 'u1', ['verified_badge']),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.IDENTITY_VERIFICATION_REQUIRED,
      });
    },
  );
});
