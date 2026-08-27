import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnstileService } from '../common/abuse/turnstile.service.js';
import { AppException } from '../common/errors/app.exception.js';
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
    it('should return followers array', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '2' });
      mockPrismaService.follow.findMany.mockResolvedValue([
        { follower: { id: '1', user: {} } },
      ]);

      const result = await service.getFollowers('user2');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return following array', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: '1' });
      mockPrismaService.follow.findMany.mockResolvedValue([
        { following: { id: '2', user: {} } },
      ]);

      const result = await service.getFollowing('user1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
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
});
