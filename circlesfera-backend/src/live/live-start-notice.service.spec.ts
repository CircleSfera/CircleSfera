import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveStartNoticeService } from './live-start-notice.service.js';

describe('LiveStartNoticeService', () => {
  let prisma: {
    profile: { findUnique: ReturnType<typeof vi.fn> };
    follow: { findMany: ReturnType<typeof vi.fn> };
  };
  let notifications: { create: ReturnType<typeof vi.fn> };
  let service: LiveStartNoticeService;

  beforeEach(() => {
    prisma = {
      profile: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ user: { isTestAccount: false } }),
      },
      follow: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'f-1', followerId: 'fan-1' },
          { id: 'f-2', followerId: 'fan-2' },
        ]),
      },
    };
    notifications = { create: vi.fn().mockResolvedValue({ id: 'n' }) };
    service = new LiveStartNoticeService(
      prisma as never,
      notifications as never,
    );
  });

  it('tells each follower that the host started a live, with the way to it', async () => {
    const told = await service.tellFollowers('stream-1', 'host-1');

    expect(told).toBe(2);
    expect(notifications.create).toHaveBeenCalledWith({
      recipientId: 'fan-1',
      senderId: 'host-1',
      type: 'LIVE_STARTED',
      notice: { key: 'live_started' },
      targetType: 'live',
      targetId: 'stream-1',
    });
    expect(notifications.create).toHaveBeenCalledTimes(2);
  });

  it('asks only for followers who are accepted, of the same audience, active and who have not muted the host', async () => {
    await service.tellFollowers('stream-1', 'host-1');

    const where = prisma.follow.findMany.mock.calls[0][0].where;
    expect(where.followingId).toBe('host-1');
    expect(where.status).toBe('ACCEPTED');
    expect(where.follower.user).toEqual({
      isTestAccount: false,
      isActive: true,
      deactivatedAt: null,
    });
    expect(where.follower.muting.none.mutedId).toBe('host-1');
  });

  it('keeps a Test Account within its own audience', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      user: { isTestAccount: true },
    });

    await service.tellFollowers('stream-1', 'host-1');

    expect(
      prisma.follow.findMany.mock.calls[0][0].where.follower.user.isTestAccount,
    ).toBe(true);
  });

  it('does not count a follower the notice was refused for, such as across a block', async () => {
    notifications.create.mockResolvedValueOnce(null);

    expect(await service.tellFollowers('stream-1', 'host-1')).toBe(1);
  });

  it('tells the followers of one live once, even when its start is asked twice', async () => {
    await service.tellFollowers('stream-1', 'host-1');
    notifications.create.mockClear();

    expect(await service.tellFollowers('stream-1', 'host-1')).toBe(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('goes through every follower, page after page', async () => {
    const page = Array.from({ length: 500 }, (_, i) => ({
      id: `f-${i}`,
      followerId: `fan-${i}`,
    }));
    prisma.follow.findMany
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce([{ id: 'f-last', followerId: 'fan-last' }]);

    expect(await service.tellFollowers('stream-2', 'host-1')).toBe(501);
    expect(prisma.follow.findMany.mock.calls[1][0]).toMatchObject({
      cursor: { id: 'f-499' },
      skip: 1,
    });
  });

  it('never fails the start of the live: a fault is logged and nobody else is told', async () => {
    prisma.follow.findMany.mockRejectedValue(new Error('db down'));

    await expect(service.tellFollowers('stream-3', 'host-1')).resolves.toBe(0);
  });
});
