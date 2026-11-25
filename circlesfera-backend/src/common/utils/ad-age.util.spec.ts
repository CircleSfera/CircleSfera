import { describe, expect, it, vi } from 'vitest';
import { adAgeFrom, adAgeOf } from './ad-age.util.js';

const day = new Date('2026-11-25T12:00:00Z');

describe('adAgeFrom', () => {
  it('is adult from the day of the birthday, not the day before', () => {
    expect(adAgeFrom(new Date('2008-11-25T00:00:00Z'), 18, day)).toEqual({
      adult: true,
      missing: false,
    });
    expect(adAgeFrom(new Date('2008-11-26T00:00:00Z'), 18, day)).toEqual({
      adult: false,
      missing: false,
    });
  });

  it('treats an account without a date of birth as under age, and says so', () => {
    expect(adAgeFrom(null, 18, day)).toEqual({ adult: false, missing: true });
    expect(adAgeFrom(undefined, 18, day)).toEqual({
      adult: false,
      missing: true,
    });
  });
});

describe('adAgeOf', () => {
  it('reads only the date of birth of that person', async () => {
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ dateOfBirth: new Date('1990-01-15T00:00:00Z') }),
      },
    };

    await expect(adAgeOf(prisma as never, 'u1', 18)).resolves.toEqual({
      adult: true,
      missing: false,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { dateOfBirth: true },
    });
  });

  it('treats an account it cannot find as under age', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };

    await expect(adAgeOf(prisma as never, 'gone', 18)).resolves.toEqual({
      adult: false,
      missing: true,
    });
  });
});
