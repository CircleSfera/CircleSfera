import { describe, expect, it, vi } from 'vitest';
import {
  deleteRefreshTokens,
  isDeadlock,
  retryOnDeadlock,
} from './refresh-token-deletion.js';

const deadlock = () =>
  Object.assign(new Error('Transaction failed due to a deadlock'), {
    code: 'P2034',
  });

describe('isDeadlock', () => {
  it.each([
    [deadlock(), true],
    [
      new Error('Raw query failed. Code: `40P01`. Message: deadlock detected'),
      true,
    ],
    [Object.assign(new Error('Unique constraint'), { code: 'P2002' }), false],
    [undefined, false],
  ])('tells a deadlock from other failures (%#)', (error, expected) => {
    expect(isDeadlock(error)).toBe(expected);
  });
});

describe('retryOnDeadlock', () => {
  it('runs the transaction again when PostgreSQL ended it for a deadlock', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(deadlock())
      .mockResolvedValueOnce('done');

    await expect(retryOnDeadlock(run)).resolves.toBe('done');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives up after three runs', async () => {
    const run = vi.fn().mockRejectedValue(deadlock());

    await expect(retryOnDeadlock(run)).rejects.toMatchObject({
      code: 'P2034',
    });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('never runs again for any other failure', async () => {
    const run = vi.fn().mockRejectedValue(new Error('constraint'));

    await expect(retryOnDeadlock(run)).rejects.toThrow('constraint');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

// Closing sessions waits for any renewal of them in progress (ADR-0032).
describe('deleteRefreshTokens', () => {
  function client(rows: { id: string }[]) {
    const tx = {
      refreshToken: {
        findMany: vi.fn().mockResolvedValue(rows),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: vi.fn(async (run: (t: typeof tx) => unknown) => run(tx)),
    };
    return { tx, prisma };
  }

  it('locks every token it deletes, in id order, before deleting, in its own transaction', async () => {
    const { tx, prisma } = client([{ id: 'a' }, { id: 'b' }]);

    const count = await deleteRefreshTokens(prisma as never, {
      userId: 'u-1',
      familyId: 'f-1',
    });

    expect(count).toBe(3);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Revoked tokens too: a renewal may hold one it was sent.
    expect(tx.refreshToken.findMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', familyId: 'f-1' },
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

  it('deletes without locking when there is nothing to delete', async () => {
    const { tx, prisma } = client([]);

    await deleteRefreshTokens(prisma as never, { userId: 'u-1' });

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
    });
  });

  it('runs inside the transaction it is given, without opening another', async () => {
    const { tx, prisma } = client([{ id: 'a' }]);

    await deleteRefreshTokens(prisma as never, { userId: 'u-1' }, tx as never);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('runs its own transaction again when it lost a deadlock with a renewal', async () => {
    const { tx, prisma } = client([{ id: 'a' }]);
    prisma.$transaction
      .mockRejectedValueOnce(deadlock())
      .mockImplementationOnce(async (run) => run(tx));

    await expect(
      deleteRefreshTokens(prisma as never, { userId: 'u-1' }),
    ).resolves.toBe(3);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
