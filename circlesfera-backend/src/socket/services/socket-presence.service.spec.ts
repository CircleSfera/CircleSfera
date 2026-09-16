import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { SocketPresenceService } from './socket-presence.service.js';

describe('SocketPresenceService', () => {
  let service: SocketPresenceService;
  let prisma: {
    follow: { findMany: ReturnType<typeof vi.fn> };
    user: { update: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prisma = {
      follow: { findMany: vi.fn() },
      user: { update: vi.fn() },
    };
    service = new SocketPresenceService(prisma as unknown as PrismaService);
  });

  it('getFollowPresenceRooms returns presence rooms for followed profiles', async () => {
    prisma.follow.findMany.mockResolvedValue([
      { followingId: 'p-2' },
      { followingId: 'p-3' },
    ]);

    const rooms = await service.getFollowPresenceRooms('p-1');

    expect(prisma.follow.findMany).toHaveBeenCalledWith({
      where: { followerId: 'p-1' },
      select: { followingId: true },
    });
    expect(rooms).toEqual(['presence:p-2', 'presence:p-3']);
  });

  it('setUserOnline updates user online state', async () => {
    await service.setUserOnline('u-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { isOnline: true },
    });
  });

  it('setUserOffline updates user offline state and lastSeenAt timestamp', async () => {
    const { lastSeenAt } = await service.setUserOffline('u-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { isOnline: false, lastSeenAt: expect.any(Date) },
    });
    expect(lastSeenAt).toBeInstanceOf(Date);
  });
});
