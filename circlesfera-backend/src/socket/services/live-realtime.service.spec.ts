import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { LiveRealtimeService } from './live-realtime.service.js';

describe('LiveRealtimeService', () => {
  let service: LiveRealtimeService;
  let prisma: {
    liveStream: {
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    user: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prisma = {
      liveStream: {
        update: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    };
    service = new LiveRealtimeService(prisma as unknown as PrismaService);
  });

  describe('canEnterRoom', () => {
    it('lets in to the room of a live for everyone on air, and keeps out of an ended one', async () => {
      const live = {
        status: 'LIVE',
        id: 'stream-1',
        hostId: 'host',
        audience: 'EVERYONE',
        host: {
          isAccountBanned: false,
          suspendedUntil: null,
          user: { isActive: true, deactivatedAt: null },
        },
      };
      Object.assign(prisma, {
        block: { findFirst: vi.fn().mockResolvedValue(null) },
      });
      Object.assign(prisma.user, { findMany: vi.fn().mockResolvedValue([]) });
      prisma.liveStream.findUnique.mockResolvedValueOnce(live);
      expect(await service.canEnterRoom('s-1', 'viewer')).toBe(true);

      prisma.liveStream.findUnique.mockResolvedValueOnce({
        ...live,
        status: 'ENDED',
      });
      expect(await service.canEnterRoom('s-1', 'viewer')).toBe(false);
    });
  });

  describe('incrementViewerCount', () => {
    it('increments viewer count and returns updated count', async () => {
      prisma.liveStream.update.mockResolvedValue({ viewerCount: 5 });

      const count = await service.incrementViewerCount('stream-1');

      expect(prisma.liveStream.update).toHaveBeenCalledWith({
        where: { id: 'stream-1' },
        data: { viewerCount: { increment: 1 } },
        select: { viewerCount: true },
      });
      expect(count).toBe(5);
    });

    it('returns 1 as fallback when database increment fails', async () => {
      prisma.liveStream.update.mockRejectedValue(
        new Error('DB connection error'),
      );

      const count = await service.incrementViewerCount('stream-1');

      expect(count).toBe(1);

      prisma.liveStream.update.mockRejectedValue('raw string error');
      const fallbackCount = await service.incrementViewerCount('stream-1');
      expect(fallbackCount).toBe(1);
    });
  });

  describe('decrementViewerCount', () => {
    it('decrements viewer count conditionally and returns the resulting count', async () => {
      prisma.liveStream.updateMany.mockResolvedValue({ count: 1 });
      prisma.liveStream.findUnique.mockResolvedValue({ viewerCount: 3 });

      const count = await service.decrementViewerCount('stream-1');

      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
        where: { id: 'stream-1', viewerCount: { gt: 0 } },
        data: { viewerCount: { decrement: 1 } },
      });
      expect(count).toBe(3);
    });

    it('never decrements below 0 — the conditional where clause is a no-op when already at 0', async () => {
      prisma.liveStream.updateMany.mockResolvedValue({ count: 0 });
      prisma.liveStream.findUnique.mockResolvedValue({ viewerCount: 0 });

      const count = await service.decrementViewerCount('stream-1');

      expect(count).toBe(0);
    });

    it('returns 0 when the stream no longer exists', async () => {
      prisma.liveStream.updateMany.mockResolvedValue({ count: 0 });
      prisma.liveStream.findUnique.mockResolvedValue(null);

      const count = await service.decrementViewerCount('stream-missing');
      expect(count).toBe(0);
    });

    it('returns 0 as fallback when the database call fails', async () => {
      prisma.liveStream.updateMany.mockRejectedValue(new Error('DB error'));
      const errorFallbackCount = await service.decrementViewerCount('stream-1');
      expect(errorFallbackCount).toBe(0);

      prisma.liveStream.updateMany.mockRejectedValue('raw string error');
      const nonErrorFallback = await service.decrementViewerCount('stream-1');
      expect(nonErrorFallback).toBe(0);
    });
  });

  describe('isStreamHostOrOnAirGuest', () => {
    it('returns true when profile is stream host', async () => {
      prisma.liveStream.findUnique.mockResolvedValue({
        hostId: 'profile-host',
        guests: [],
      });

      expect(
        await service.isStreamHostOrOnAirGuest('stream-1', 'profile-host'),
      ).toBe(true);
    });

    it('returns true for a guest on air, reading only their own row', async () => {
      prisma.liveStream.findUnique.mockResolvedValue({
        hostId: 'profile-host',
        guests: [{ status: 'ON_AIR' }],
      });

      expect(
        await service.isStreamHostOrOnAirGuest('stream-1', 'profile-guest'),
      ).toBe(true);
      expect(prisma.liveStream.findUnique).toHaveBeenCalledWith({
        where: { id: 'stream-1' },
        select: {
          hostId: true,
          guests: {
            where: { profileId: 'profile-guest' },
            select: { status: true },
          },
        },
      });
    });

    it('returns false for a guest only invited, or out of the live', async () => {
      for (const status of ['INVITED', 'LEFT', 'REMOVED', 'DECLINED']) {
        prisma.liveStream.findUnique.mockResolvedValue({
          hostId: 'profile-host',
          guests: [{ status }],
        });
        expect(
          await service.isStreamHostOrOnAirGuest('stream-1', 'profile-guest'),
        ).toBe(false);
      }
    });

    it('returns false when profile is neither host nor guest', async () => {
      prisma.liveStream.findUnique.mockResolvedValue({
        hostId: 'profile-host',
        guests: [],
      });

      expect(
        await service.isStreamHostOrOnAirGuest('stream-1', 'viewer-profile'),
      ).toBe(false);
    });

    it('returns false if stream is not found', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(null);

      expect(
        await service.isStreamHostOrOnAirGuest(
          'stream-nonexistent',
          'viewer-profile',
        ),
      ).toBe(false);
    });

    it('returns false when streamId or profileId is empty', async () => {
      expect(await service.isStreamHostOrOnAirGuest('', 'prof-1')).toBe(false);
      expect(await service.isStreamHostOrOnAirGuest('stream-1', '')).toBe(
        false,
      );
    });
  });

  describe('getUserProfile', () => {
    it('returns user profile data for chat messages', async () => {
      prisma.user.findUnique.mockResolvedValue({
        profiles: [{ id: 'p-1', username: 'user1', avatar: 'avatar.png' }],
      });

      const profile = await service.getUserProfile('u-1');

      expect(profile).toEqual({
        id: 'p-1',
        username: 'user1',
        avatar: 'avatar.png',
      });
    });

    it('returns null if user or profile not found', async () => {
      prisma.user.findUnique.mockResolvedValue({ profiles: [] });

      const profile = await service.getUserProfile('u-nonexistent');

      expect(profile).toBeNull();
    });
  });
});
