import { ErrorCode, FAVORITES_MAX } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FavoritesService } from './favorites.service.js';

describe('FavoritesService', () => {
  const tx = {
    favoriteProfile: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
  const prisma = {
    favoriteProfile: { findMany: vi.fn(), deleteMany: vi.fn() },
    follow: { findUnique: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  let service: FavoritesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FavoritesService(prisma as never);
    tx.favoriteProfile.findUnique.mockResolvedValue(null);
    tx.favoriteProfile.count.mockResolvedValue(0);
    prisma.follow.findUnique.mockResolvedValue({ status: 'ACCEPTED' });
  });

  it('lists Favorites as public profiles, the latest added first', async () => {
    const at = new Date('2026-11-09T10:00:00Z');
    prisma.favoriteProfile.findMany.mockResolvedValue([
      { createdAt: at, favorite: { id: 'fav-1', username: 'ana' } },
    ]);

    await expect(service.list('me')).resolves.toEqual([
      { id: 'fav-1', username: 'ana', addedAt: at },
    ]);
    const query = prisma.favoriteProfile.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ profileId: 'me' });
    expect(query.orderBy[0]).toEqual({ createdAt: 'desc' });
    // Nothing that links the Profile to its person.
    expect(query.select.favorite.select.user).toBeUndefined();
  });

  it('adds a Profile one follows, under a lock on one’s Profile', async () => {
    await expect(service.add('me', 'fav-1')).resolves.toEqual({
      favoriteId: 'fav-1',
      isFavorite: true,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.favoriteProfile.create).toHaveBeenCalledWith({
      data: { profileId: 'me', favoriteId: 'fav-1' },
    });
    expect(
      tx.$queryRaw.mock.invocationCallOrder[0] <
        tx.favoriteProfile.count.mock.invocationCallOrder[0],
    ).toBe(true);
  });

  it.each([
    ['not followed', null],
    ['only requested', { status: 'PENDING' }],
  ])('refuses a Profile %s', async (_label, follow) => {
    prisma.follow.findUnique.mockResolvedValue(follow);
    await expect(service.add('me', 'other')).rejects.toMatchObject({
      errorCode: ErrorCode.FAVORITE_NOT_FOLLOWED,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses oneself', async () => {
    await expect(service.add('me', 'me')).rejects.toMatchObject({
      errorCode: ErrorCode.FAVORITE_NOT_FOLLOWED,
    });
    expect(prisma.follow.findUnique).not.toHaveBeenCalled();
  });

  it('refuses past the limit', async () => {
    tx.favoriteProfile.count.mockResolvedValue(FAVORITES_MAX);
    await expect(service.add('me', 'fav-1')).rejects.toMatchObject({
      errorCode: ErrorCode.FAVORITES_FULL,
    });
    expect(tx.favoriteProfile.create).not.toHaveBeenCalled();
  });

  it('changes nothing when it is already a Favorite, even when full', async () => {
    tx.favoriteProfile.findUnique.mockResolvedValue({ profileId: 'me' });
    tx.favoriteProfile.count.mockResolvedValue(FAVORITES_MAX);
    await expect(service.add('me', 'fav-1')).resolves.toEqual({
      favoriteId: 'fav-1',
      isFavorite: true,
    });
    expect(tx.favoriteProfile.create).not.toHaveBeenCalled();
  });

  it('removes one, and removing one not there changes nothing', async () => {
    prisma.favoriteProfile.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('me', 'fav-1')).resolves.toEqual({
      favoriteId: 'fav-1',
      isFavorite: false,
    });
    expect(prisma.favoriteProfile.deleteMany).toHaveBeenCalledWith({
      where: { profileId: 'me', favoriteId: 'fav-1' },
    });
  });
});
