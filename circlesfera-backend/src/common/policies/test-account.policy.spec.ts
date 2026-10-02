import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  assertRealMoneyAllowed,
  assertSameAudience,
  isSameAudience,
  isTestViewer,
  sameAudienceProfileWhere,
  sameAudienceSql,
} from './test-account.policy.js';

describe('test-account policy', () => {
  it.each([
    [null, false],
    [undefined, false],
    [{}, false],
    [{ isTestAccount: false }, false],
    [{ isTestAccount: true }, true],
  ])('treats viewer %j as test=%s', (viewer, expected) => {
    expect(isTestViewer(viewer)).toBe(expected);
  });

  it('limits anonymous and real viewers to real accounts', () => {
    expect(sameAudienceProfileWhere(null)).toEqual({
      user: { isTestAccount: false },
    });
    expect(sameAudienceProfileWhere({ isTestAccount: false })).toEqual({
      user: { isTestAccount: false },
    });
  });

  it('limits a test viewer to test accounts', () => {
    expect(sameAudienceProfileWhere({ isTestAccount: true })).toEqual({
      user: { isTestAccount: true },
    });
  });

  it('builds a parameterised SQL condition on the given users alias', () => {
    const sql = sameAudienceSql({ isTestAccount: true }, 'u');
    expect(sql.sql).toBe('"u"."isTestAccount" = ?');
    expect(sql.values).toEqual([true]);
    expect(sameAudienceSql(null, 'u').values).toEqual([false]);
  });

  it('checks the target profile inside the viewer audience', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'p-1' });
    const db = { profile: { findFirst } } as never;

    await expect(
      isSameAudience(db, { isTestAccount: false }, 'p-1'),
    ).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', user: { isTestAccount: false } },
      select: { id: true },
    });
  });

  it('answers a cross-audience target as not found', async () => {
    const db = {
      profile: { findFirst: vi.fn().mockResolvedValue(null) },
    } as never;

    await expect(
      assertSameAudience(db, { isTestAccount: false }, 'p-test'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('assertRealMoneyAllowed', () => {
  it('rejects a Test Account before any payment request', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ isTestAccount: true }),
      },
    } as never;

    await expect(assertRealMoneyAllowed(db, 'u-test')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows a real account', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ isTestAccount: false }),
      },
    } as never;

    await expect(assertRealMoneyAllowed(db, 'u-real')).resolves.toBeUndefined();
  });
});
