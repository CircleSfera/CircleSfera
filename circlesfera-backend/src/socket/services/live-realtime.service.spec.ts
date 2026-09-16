import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { LiveRealtimeService } from './live-realtime.service.js';

describe('LiveRealtimeService', () => {
  let service: LiveRealtimeService;
  let prisma: {
    liveStream: {
      update: ReturnType<typeof vi.fn>;
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
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    };
    service = new LiveRealtimeService(prisma as unknown as PrismaService);
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
    });
  });

  describe('decrementViewerCount', () => {
    it('decrements viewer count and returns updated count bounded to 0', async () => {
      prisma.liveStream.update.mockResolvedValue({ viewerCount: 3 });

      const count = await service.decrementViewerCount('stream-1');

      expect(prisma.liveStream.update).toHaveBeenCalledWith({
        where: { id: 'stream-1' },
        data: { viewerCount: { decrement: 1 } },
        select: { viewerCount: true },
      });
      expect(count).toBe(3);
    });

    it('returns 0 when database decrement results in negative number or fails', async () => {
      prisma.liveStream.update.mockResolvedValue({ viewerCount: -1 });

      const count = await service.decrementViewerCount('stream-1');
      expect(count).toBe(0);

      prisma.liveStream.update.mockRejectedValue(new Error('DB error'));
      const errorFallbackCount = await service.decrementViewerCount('stream-1');
      expect(errorFallbackCount).toBe(0);
    });
  });

  describe('isStreamHostOrCoHost', () => {
    it('returns true when profile is stream host', async () => {
      prisma.liveStream.findUnique.mockResolvedValue({
        hostId: 'profile-host',
        coHostId: null,
      });

      const isHost = await service.isStreamHostOrCoHost(
        'stream-1',
        'profile-host',
      );
      expect(isHost).toBe(true);
    });

    it('returns true when profile is stream co-host', async () => {
      prisma.liveStream.findUnique.mockResolvedValue({
        hostId: 'profile-host',
        coHostId: 'profile-cohost',
      });

      const isCoHost = await service.isStreamHostOrCoHost(
        'stream-1',
        'profile-cohost',
      );
      expect(isCoHost).toBe(true);
    });

    it('returns false when profile is neither host nor cohost', async () => {
      prisma.liveStream.findUnique.mockResolvedValue({
        hostId: 'profile-host',
        coHostId: 'profile-cohost',
      });

      const result = await service.isStreamHostOrCoHost(
        'stream-1',
        'viewer-profile',
      );
      expect(result).toBe(false);
    });

    it('returns false if stream is not found', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(null);

      const result = await service.isStreamHostOrCoHost(
        'stream-nonexistent',
        'viewer-profile',
      );
      expect(result).toBe(false);
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
