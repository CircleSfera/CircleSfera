import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AppGateway } from '../socket/app.gateway.js';
import { RestrictionsService } from './restrictions.service.js';

describe('RestrictionsService', () => {
  const socketsLeave = vi.fn();
  const socketsJoin = vi.fn();
  const gateway = {
    server: { in: vi.fn(() => ({ socketsLeave, socketsJoin })) },
  };
  let prisma: any;
  let service: RestrictionsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = {
      profile: {
        findFirst: vi.fn(async ({ where }: any) =>
          where.username.equals === 'nobody'
            ? null
            : { id: `id-${where.username.equals}` },
        ),
      },
      restriction: {
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      follow: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    service = new RestrictionsService(
      prisma as unknown as PrismaService,
      gateway as unknown as AppGateway,
    );
  });

  it('restricts once per pair, and the restricted Profile stops hearing when the restricter is active', async () => {
    await expect(service.restrict('me', 'bob')).resolves.toEqual({
      restricted: true,
    });

    expect(prisma.restriction.upsert).toHaveBeenCalledWith({
      where: {
        restricterId_restrictedId: {
          restricterId: 'me',
          restrictedId: 'id-bob',
        },
      },
      create: { restricterId: 'me', restrictedId: 'id-bob' },
      update: {},
    });
    expect(gateway.server.in).toHaveBeenCalledWith('user:id-bob');
    expect(socketsLeave).toHaveBeenCalledWith('presence:me');
  });

  it('refuses to restrict oneself or a Profile that does not exist', async () => {
    await expect(service.restrict('id-me', 'me')).rejects.toMatchObject({
      response: { errorCode: 'CANNOT_RESTRICT_SELF' },
    });
    await expect(service.restrict('me', 'nobody')).rejects.toMatchObject({
      response: { errorCode: 'USER_NOT_FOUND' },
    });
    expect(prisma.restriction.upsert).not.toHaveBeenCalled();
  });

  it('never fails a restriction because live connections could not move', async () => {
    socketsLeave.mockImplementationOnce(() => {
      throw new Error('adapter down');
    });
    await expect(service.restrict('me', 'bob')).resolves.toEqual({
      restricted: true,
    });
  });

  it('unrestricts, and a follower hears again when the restricter is active', async () => {
    prisma.follow.findFirst.mockResolvedValueOnce({ id: 'f-1' });

    await expect(service.unrestrict('me', 'bob')).resolves.toEqual({
      restricted: false,
    });

    expect(prisma.restriction.deleteMany).toHaveBeenCalledWith({
      where: { restricterId: 'me', restrictedId: 'id-bob' },
    });
    expect(prisma.follow.findFirst).toHaveBeenCalledWith({
      where: { followerId: 'id-bob', followingId: 'me' },
      select: { id: true },
    });
    expect(socketsJoin).toHaveBeenCalledWith('presence:me');
  });

  it('adds no presence to someone who does not follow, nor when nothing was restricted', async () => {
    await service.unrestrict('me', 'bob');
    expect(socketsJoin).not.toHaveBeenCalled();

    prisma.restriction.deleteMany.mockResolvedValueOnce({ count: 0 });
    prisma.follow.findFirst.mockResolvedValue({ id: 'f-1' });
    await service.unrestrict('me', 'carl');
    expect(socketsJoin).not.toHaveBeenCalled();
  });

  it('says whether the active Profile restricts someone, which is only its own choice', async () => {
    prisma.restriction.findUnique.mockResolvedValueOnce({ id: 'r-1' });
    await expect(service.status('me', 'bob')).resolves.toEqual({
      restricted: true,
    });
    expect(prisma.restriction.findUnique).toHaveBeenCalledWith({
      where: {
        restricterId_restrictedId: {
          restricterId: 'me',
          restrictedId: 'id-bob',
        },
      },
      select: { id: true },
    });
    await expect(service.status('me', 'nobody')).resolves.toEqual({
      restricted: false,
    });
  });

  it('lists the Profiles it restricts, most recent first', async () => {
    prisma.restriction.findMany.mockResolvedValueOnce([
      { restricted: { id: 'id-bob' } },
    ]);
    await expect(service.list('me')).resolves.toEqual([{ id: 'id-bob' }]);
    expect(prisma.restriction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { restricterId: 'me' },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});
