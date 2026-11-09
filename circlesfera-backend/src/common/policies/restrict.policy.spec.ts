import { describe, expect, it, vi } from 'vitest';
import { restrictersOf, restricts } from './restrict.policy.js';

describe('restrict policy', () => {
  it('reads one pair, and never asks about oneself or nobody', async () => {
    const db = {
      restriction: { findUnique: vi.fn().mockResolvedValue({ id: 'r' }) },
    } as any;
    await expect(restricts(db, 'a', 'b')).resolves.toBe(true);
    expect(db.restriction.findUnique).toHaveBeenCalledWith({
      where: {
        restricterId_restrictedId: { restricterId: 'a', restrictedId: 'b' },
      },
      select: { id: true },
    });
    db.restriction.findUnique.mockClear();
    await expect(restricts(db, 'a', 'a')).resolves.toBe(false);
    await expect(restricts(db, undefined, 'b')).resolves.toBe(false);
    expect(db.restriction.findUnique).not.toHaveBeenCalled();
  });

  it('finds, among some Profiles, those that restrict a viewer', async () => {
    const db = {
      restriction: {
        findMany: vi.fn().mockResolvedValueOnce([{ restricterId: 'b' }]),
      },
    } as any;
    await expect(
      restrictersOf(db, 'me', ['me', 'b', 'b', 'c']),
    ).resolves.toEqual(new Set(['b']));
    expect(db.restriction.findMany).toHaveBeenLastCalledWith({
      where: { restrictedId: 'me', restricterId: { in: ['b', 'c'] } },
      select: { restricterId: true },
    });
    await expect(restrictersOf(db, 'me', ['me'])).resolves.toEqual(new Set());
    expect(db.restriction.findMany).toHaveBeenCalledTimes(1);
  });
});
