import { describe, expect, it, vi } from 'vitest';
import { deleteRefreshTokens } from './refresh-token-deletion.js';

// Closing sessions waits for any renewal of them in progress (ADR-0032).
describe('deleteRefreshTokens', () => {
  function client(live: { id: string }[]) {
    const tx = {
      refreshToken: {
        findMany: vi.fn().mockResolvedValue(live),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const root = {
      ...tx,
      $transaction: vi.fn(async (run: (t: typeof tx) => unknown) => run(tx)),
    };
    return { tx, root };
  }

  it('locks the live tokens, in id order, before deleting, in one transaction', async () => {
    const { tx, root } = client([{ id: 'a' }, { id: 'b' }]);

    const count = await deleteRefreshTokens(root as never, {
      userId: 'u-1',
      familyId: 'f-1',
    });

    expect(count).toBe(3);
    expect(root.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.findMany).toHaveBeenCalledWith({
      where: {
        AND: [{ userId: 'u-1', familyId: 'f-1' }, { isRevoked: false }],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    // The ids are bound as parameters, never written into the statement.
    const [sql, ids] = tx.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      { values: unknown[] },
    ];
    expect(sql.join('?')).toBe(
      'SELECT id FROM refresh_tokens WHERE id IN (?) ORDER BY id FOR UPDATE',
    );
    expect(ids.values).toEqual(['a', 'b']);
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', familyId: 'f-1' },
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.refreshToken.deleteMany.mock.invocationCallOrder[0],
    );
  });

  it('deletes without locking when no token is live', async () => {
    const { tx, root } = client([]);

    await deleteRefreshTokens(root as never, { userId: 'u-1' });

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
    });
  });

  it('runs inside the transaction it is given, without opening another', async () => {
    const { tx } = client([{ id: 'a' }]);

    await deleteRefreshTokens(tx as never, { userId: 'u-1' });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
  });
});
