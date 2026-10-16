import { describe, expect, it, vi } from 'vitest';
import { getBlockedProfileIds, isBlockedEitherWay } from './block.policy.js';

/** A database with the accounts' audiences and the blocks given. */
function db(
  audiences: Record<string, boolean>,
  blocks: { blockerId: string; blockedId: string }[] = [],
) {
  return {
    user: {
      findMany: vi.fn(async () =>
        Object.entries(audiences).map(([id, isTestAccount]) => ({
          isTestAccount,
          profiles: [{ id }],
        })),
      ),
    },
    block: {
      findFirst: vi.fn(
        async ({ where }: { where: { OR: typeof blocks } }) =>
          blocks.find((b) =>
            where.OR.some(
              (w) => w.blockerId === b.blockerId && w.blockedId === b.blockedId,
            ),
          ) ?? null,
      ),
      findMany: vi.fn(async () => blocks),
    },
  } as never;
}

describe('isBlockedEitherWay', () => {
  it('never blocks a profile from itself, or from nobody', async () => {
    await expect(isBlockedEitherWay(db({}), 'a', 'a')).resolves.toBe(false);
    await expect(isBlockedEitherWay(db({}), 'a', null)).resolves.toBe(false);
  });

  it('keeps a Test Account and a real one apart, as a block', async () => {
    await expect(
      isBlockedEitherWay(db({ test: true, real: false }), 'real', 'test'),
    ).resolves.toBe(true);
  });

  it('blocks someone not signed in only from a Test Account', async () => {
    await expect(
      isBlockedEitherWay(db({ test: true }), null, 'test'),
    ).resolves.toBe(true);
    await expect(
      isBlockedEitherWay(db({ real: false }), null, 'real'),
    ).resolves.toBe(false);
  });

  it('sees a block in either direction', async () => {
    const blocks = [{ blockerId: 'b', blockedId: 'a' }];
    const both = { a: false, b: false };
    await expect(isBlockedEitherWay(db(both, blocks), 'a', 'b')).resolves.toBe(
      true,
    );
    await expect(isBlockedEitherWay(db(both, blocks), 'b', 'a')).resolves.toBe(
      true,
    );
    await expect(isBlockedEitherWay(db(both), 'a', 'b')).resolves.toBe(false);
  });
});

describe('getBlockedProfileIds', () => {
  it('lists the other side of every block, and nothing for nobody', async () => {
    const blocks = [
      { blockerId: 'a', blockedId: 'b' },
      { blockerId: 'c', blockedId: 'a' },
    ];
    await expect(getBlockedProfileIds(db({}, blocks), 'a')).resolves.toEqual([
      'b',
      'c',
    ]);
    await expect(getBlockedProfileIds(db({}, blocks), null)).resolves.toEqual(
      [],
    );
  });
});
