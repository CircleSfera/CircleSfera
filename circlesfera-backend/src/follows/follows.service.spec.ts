import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnstileService } from '../common/abuse/turnstile.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { encodeKeysetCursor } from '../common/pagination/keyset.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SYSTEM_SETTING_KEYS } from '../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { FollowsService } from './follows.service.js';

describe('FollowsService', () => {
  let service: FollowsService;

  const mockPrismaService = {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    profile: { findUnique: vi.fn(), findFirst: vi.fn() },
    follow: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    block: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    mute: {
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        {
          provide: SystemSettingsService,
          useValue: {
            isEnabled: vi.fn(async (key: string) => {
              if (key === SYSTEM_SETTING_KEYS.EMAIL_VERIFICATION_REQUIRED)
                return false;
              return true;
            }),
          },
        },
        {
          provide: TurnstileService,
          useValue: {
            assertValid: vi.fn().mockResolvedValue(undefined),
            incrementEmailForbidden: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FollowsService>(FollowsService);
    vi.clearAllMocks();
  });

  describe('toggle', () => {
    const followerId = 'user-1';
    const followingUsername = 'user2';
    const followingId = 'user-2';

    it('should follow a public user successfully', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: followingId,
        userId: 'user-2-account',
        isPrivate: false,
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        settings: { privacyLevel: 'PUBLIC' },
      });
      mockPrismaService.block.findUnique.mockResolvedValue(null);
      mockPrismaService.follow.findUnique.mockResolvedValue(null);

      const result = await service.toggle(
        followingUsername,
        followerId,
        'dummyUserId',
      );

      expect(result.status).toBe('ACCEPTED');
      expect(mockPrismaService.follow.create).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          type: 'FOLLOW',
        }),
      );
    });

    it('should create a pending request for private users', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: followingId,
        userId: 'user-2-account',
        isPrivate: true,
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        settings: { privacyLevel: 'PRIVATE' },
      });
      mockPrismaService.block.findUnique.mockResolvedValue(null);
      mockPrismaService.follow.findUnique.mockResolvedValue(null);

      const result = await service.toggle(
        followingUsername,
        followerId,
        'dummyUserId',
      );

      expect(result.status).toBe('PENDING');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          type: 'FOLLOW_REQUEST',
        }),
      );
    });

    it('should unfollow an already followed user', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: followingId,
        userId: 'user-2-account',
      });
      mockPrismaService.block.findUnique.mockResolvedValue(null);
      mockPrismaService.follow.findUnique.mockResolvedValue({ id: 'follow-1' });

      const result = await service.toggle(
        followingUsername,
        followerId,
        'dummyUserId',
      );

      expect(result.following).toBe(false);
      expect(mockPrismaService.follow.delete).toHaveBeenCalled();
    });

    it('should throw BadRequestException for self-follow', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: followerId,
        userId: 'user-1-account',
      });

      await expect(
        service.toggle(followingUsername, followerId, 'dummyUserId'),
      ).rejects.toThrow(AppException);
    });

    it('should throw NotFoundException if user is blocked', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: followingId,
        userId: 'user-2-account',
      });
      mockPrismaService.block.findUnique.mockResolvedValue({ id: 'block-1' });

      await expect(
        service.toggle(followingUsername, followerId, 'dummyUserId'),
      ).rejects.toThrow(AppException);
    });
  });

  describe('checkFollow', () => {
    it('should return following: true if accepted', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '2' });
      mockPrismaService.block.findUnique.mockResolvedValue(null);
      mockPrismaService.follow.findUnique.mockResolvedValue({
        status: 'ACCEPTED',
      });

      const result = await service.checkFollow('user2', '1');
      expect(result.following).toBe(true);
      expect(result.status).toBe('ACCEPTED');
    });

    it('should return following: false if pending', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '2' });
      mockPrismaService.block.findUnique.mockResolvedValue(null);
      mockPrismaService.follow.findUnique.mockResolvedValue({
        status: 'PENDING',
      });

      const result = await service.checkFollow('user2', '1');
      expect(result.following).toBe(false);
      expect(result.status).toBe('PENDING');
    });

    it('should return status BLOCKED if blocked', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '2' });
      mockPrismaService.block.findUnique.mockResolvedValue({ id: 'b1' });

      const result = await service.checkFollow('user2', '1');
      expect(result.status).toBe('BLOCKED');
    });
  });

  describe('getLists', () => {
    it('should return followers page with no nextCursor when under the limit', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '2' });
      mockPrismaService.follow.findMany.mockResolvedValue([
        {
          id: 'f1',
          createdAt: new Date('2026-01-01'),
          follower: { id: '1', user: {} },
        },
      ]);

      const result = await service.getFollowers('user2');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('1');
      expect(result.nextCursor).toBeUndefined();
    });

    it('should return following page with no nextCursor when under the limit', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '1' });
      mockPrismaService.follow.findMany.mockResolvedValue([
        {
          id: 'f2',
          createdAt: new Date('2026-01-01'),
          following: { id: '2', user: {} },
        },
      ]);

      const result = await service.getFollowing('user1');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('2');
      expect(result.nextCursor).toBeUndefined();
    });

    it('should return nextCursor when a full extra page-plus-one row is fetched', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '2' });
      const rows = Array.from({ length: 21 }, (_, i) => ({
        id: `f${i}`,
        createdAt: new Date(2026, 0, 21 - i),
        follower: { id: `p${i}`, user: {} },
      }));
      mockPrismaService.follow.findMany.mockResolvedValue(rows);

      const result = await service.getFollowers('user2');
      expect(result.data).toHaveLength(20);
      expect(result.nextCursor).toBe(
        encodeKeysetCursor({ createdAt: new Date(2026, 0, 2), id: 'f19' }),
      );
      expect(mockPrismaService.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 21 }),
      );
    });

    it('should decode an opaque cursor into a keyset WHERE clause without any DB lookup', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '2' });
      mockPrismaService.follow.findMany.mockResolvedValue([]);
      const cursor = encodeKeysetCursor({
        createdAt: new Date('2026-01-05'),
        id: 'f5',
      });

      await service.getFollowers('user2', cursor);

      expect(mockPrismaService.follow.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { createdAt: { lt: new Date('2026-01-05') } },
              { createdAt: new Date('2026-01-05'), id: { lt: 'f5' } },
            ],
          }),
        }),
      );
    });

    it('should degrade to the first page for a malformed or stale cursor', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '2' });
      mockPrismaService.follow.findMany.mockResolvedValue([]);

      await service.getFollowers('user2', 'not-a-valid-cursor');

      expect(mockPrismaService.follow.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            followingId: '2',
            status: 'ACCEPTED',
          },
        }),
      );
    });
  });

  describe('block management', () => {
    it('should block user and remove existing follows', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'blocked-id',
        userId: 'blocked-account',
      });

      await service.blockUser('blocker-id', 'blocked');

      expect(mockPrismaService.block.create).toHaveBeenCalled();
      expect(mockPrismaService.follow.deleteMany).toHaveBeenCalled();
    });

    it('should throw AppException when blocking self', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '1' });
      await expect(service.blockUser('1', 'self')).rejects.toThrow(
        AppException,
      );
    });

    it('should unblock user successfully', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '2' });
      mockPrismaService.block.delete.mockResolvedValue({ id: 'b1' });

      const result = await service.unblockUser('1', 'user2');
      expect(result.success).toBe(true);
      expect(mockPrismaService.block.delete).toHaveBeenCalled();
    });

    it('should get blocked users', async () => {
      mockPrismaService.block.findMany.mockResolvedValue([
        { blocked: { id: '2', user: {} } },
      ]);

      const result = await service.getBlockedUsers('1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });
  });

  describe('request management', () => {
    it('should get pending requests', async () => {
      mockPrismaService.follow.findMany.mockResolvedValue([
        { follower: { id: '2', user: {} } },
      ]);

      const result = await service.getPendingRequests('1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should accept a pending request', async () => {
      const requesterUsername = 'requester';
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'user-req',
        userId: 'user-req-account',
      });
      mockPrismaService.follow.findUnique.mockResolvedValue({
        id: 'follow-1',
        status: 'PENDING',
      });

      await service.acceptFollowRequest('user-owner', requesterUsername);

      expect(mockPrismaService.follow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ACCEPTED' },
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          type: 'FOLLOW_ACCEPTED',
        }),
      );
    });

    it('should reject follow request', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '2' });
      mockPrismaService.follow.findUnique.mockResolvedValue({
        id: 'f1',
        status: 'PENDING',
      });

      const result = await service.rejectFollowRequest('1', 'user2');
      expect(result.success).toBe(true);
      expect(mockPrismaService.follow.delete).toHaveBeenCalled();
    });

    it('should throw if no pending request to accept', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '2' });
      mockPrismaService.follow.findUnique.mockResolvedValue(null);

      await expect(service.acceptFollowRequest('1', 'user2')).rejects.toThrow(
        AppException,
      );
    });
  });

  describe('muteUser', () => {
    it('creates a forever mute when duration is omitted', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'muted-1',
        username: 'bob',
      });
      mockPrismaService.mute.upsert.mockResolvedValue({});

      const result = await service.muteUser('muter-1', 'bob');

      expect(result).toEqual({ success: true, expiresAt: null });
      expect(mockPrismaService.mute.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            muterId: 'muter-1',
            mutedId: 'muted-1',
            expiresAt: null,
          }),
          update: { expiresAt: null },
        }),
      );
    });

    it('sets expiresAt for a 24h mute', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-05T12:00:00.000Z'));
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'muted-1',
        username: 'bob',
      });
      mockPrismaService.mute.upsert.mockResolvedValue({});

      const result = await service.muteUser('muter-1', 'bob', '24h');

      expect(result.success).toBe(true);
      expect(result.expiresAt).toBe('2026-09-06T12:00:00.000Z');
      vi.useRealTimers();
    });

    it('sets expiresAt for 7d, 30d, and throws for self-mute or missing user', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-05T12:00:00.000Z'));
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'muted-1',
        username: 'bob',
      });
      mockPrismaService.mute.upsert.mockResolvedValue({});

      const res7d = await service.muteUser('muter-1', 'bob', '7d');
      expect(res7d.expiresAt).toBe('2026-09-12T12:00:00.000Z');

      const res30d = await service.muteUser('muter-1', 'bob', '30d');
      expect(res30d.expiresAt).toBe('2026-10-05T12:00:00.000Z');
      vi.useRealTimers();

      // Missing profile
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      await expect(service.muteUser('muter-1', 'unknown')).rejects.toThrow(
        AppException,
      );

      // Self mute
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: 'muter-1' });
      await expect(service.muteUser('muter-1', 'self')).rejects.toThrow(
        AppException,
      );
    });
  });

  describe('unmuteUser & getMutedUsers', () => {
    it('unmutes user successfully and handles delete errors gracefully', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: 'muted-2' });
      mockPrismaService.mute.delete.mockResolvedValue({});

      const res = await service.unmuteUser('muter-1', 'muted2');
      expect(res.success).toBe(true);

      // Delete throws (not muted)
      mockPrismaService.mute.delete.mockRejectedValue(
        new Error('Record not found'),
      );
      const resError = await service.unmuteUser('muter-1', 'muted2');
      expect(resError.success).toBe(true);

      // User not found
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      await expect(service.unmuteUser('muter-1', 'missing')).rejects.toThrow(
        AppException,
      );
    });

    it('gets active muted users after pruning expired entries', async () => {
      mockPrismaService.mute.deleteMany.mockResolvedValue({ count: 2 });
      mockPrismaService.mute.findMany.mockResolvedValue([
        {
          createdAt: new Date(),
          expiresAt: null,
          muted: { id: 'muted-3', user: {} },
        },
      ]);

      const result = await service.getMutedUsers('muter-1');
      expect(result).toHaveLength(1);
      expect(mockPrismaService.mute.deleteMany).toHaveBeenCalled();
    });
  });

  describe('edge cases for block, list, check, and requests', () => {
    it('throws NotFound in toggle if profile not found', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      await expect(
        service.toggle('unknown', 'user-1', 'user-1'),
      ).rejects.toThrow(AppException);
    });

    it('returns NONE in checkFollow if profile not found', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      const res = await service.checkFollow('unknown', 'user-1');
      expect(res).toEqual({ following: false, status: 'NONE' });
    });

    it('throws NotFound in getFollowers and getFollowing if profile not found', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      await expect(service.getFollowers('unknown')).rejects.toThrow(
        AppException,
      );
      await expect(service.getFollowing('unknown')).rejects.toThrow(
        AppException,
      );
    });

    it('throws NotFound in blockUser and unblockUser if profile not found', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      await expect(service.blockUser('u1', 'unknown')).rejects.toThrow(
        AppException,
      );
      await expect(service.unblockUser('u1', 'unknown')).rejects.toThrow(
        AppException,
      );
    });

    it('throws NotFound in acceptFollowRequest and rejectFollowRequest if profile or request not found', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      await expect(
        service.acceptFollowRequest('u1', 'unknown'),
      ).rejects.toThrow(AppException);
      await expect(
        service.rejectFollowRequest('u1', 'unknown'),
      ).rejects.toThrow(AppException);

      mockPrismaService.profile.findFirst.mockResolvedValue({ id: 'u-req' });
      mockPrismaService.follow.findUnique.mockResolvedValue({
        id: 'f-acc',
        status: 'ACCEPTED',
      });
      await expect(service.acceptFollowRequest('u1', 'u-req')).rejects.toThrow(
        AppException,
      );
      await expect(service.rejectFollowRequest('u1', 'u-req')).rejects.toThrow(
        AppException,
      );
    });
  });
});
