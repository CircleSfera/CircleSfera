import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { FollowsController } from './follows.controller.js';
import { FollowsService } from './follows.service.js';

describe('FollowsController', () => {
  let controller: FollowsController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    toggle: vi.fn(),
    checkFollow: vi.fn(),
    getFollowers: vi.fn(),
    getFollowing: vi.fn(),
    blockUser: vi.fn(),
    unblockUser: vi.fn(),
    muteUser: vi.fn(),
    unmuteUser: vi.fn(),
    getMutedUsers: vi.fn(),
    getBlockedUsers: vi.fn(),
    getPendingRequests: vi.fn(),
    acceptFollowRequest: vi.fn(),
    rejectFollowRequest: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FollowsController],
      providers: [{ provide: FollowsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FollowsController>(FollowsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('toggles follow with username, profileId and userId', async () => {
    mockService.toggle.mockResolvedValue({ following: true });

    await controller.toggle('alice', mockUser);

    expect(mockService.toggle).toHaveBeenCalledWith(
      'alice',
      'profile-1',
      'user-1',
    );
  });

  it('checks follow status with the caller profileId', async () => {
    mockService.checkFollow.mockResolvedValue({ following: false });

    await controller.check('alice', mockUser);

    expect(mockService.checkFollow).toHaveBeenCalledWith('alice', 'profile-1');
  });

  it('blocks and unblocks using the caller profileId', async () => {
    mockService.blockUser.mockResolvedValue({ blocked: true });
    mockService.unblockUser.mockResolvedValue({ blocked: false });

    await controller.block('alice', mockUser);
    await controller.unblock('alice', mockUser);

    expect(mockService.blockUser).toHaveBeenCalledWith('profile-1', 'alice');
    expect(mockService.unblockUser).toHaveBeenCalledWith('profile-1', 'alice');
  });

  it('mutes and unmutes using the caller profileId', async () => {
    mockService.muteUser.mockResolvedValue({ muted: true });
    mockService.unmuteUser.mockResolvedValue({ muted: false });

    await controller.mute('alice', {}, mockUser);
    await controller.unmute('alice', mockUser);

    expect(mockService.muteUser).toHaveBeenCalledWith(
      'profile-1',
      'alice',
      undefined,
    );
    expect(mockService.unmuteUser).toHaveBeenCalledWith('profile-1', 'alice');
  });

  it('lists muted, blocked and pending from the caller profile', async () => {
    mockService.getMutedUsers.mockResolvedValue([]);
    mockService.getBlockedUsers.mockResolvedValue([]);
    mockService.getPendingRequests.mockResolvedValue([]);

    await controller.getMuted(mockUser);
    await controller.getBlocked(mockUser);
    await controller.getPendingRequests(mockUser);

    expect(mockService.getMutedUsers).toHaveBeenCalledWith('profile-1');
    expect(mockService.getBlockedUsers).toHaveBeenCalledWith('profile-1');
    expect(mockService.getPendingRequests).toHaveBeenCalledWith('profile-1');
  });

  it('accepts and rejects follow requests as the target profile', async () => {
    mockService.acceptFollowRequest.mockResolvedValue({ accepted: true });
    mockService.rejectFollowRequest.mockResolvedValue({ rejected: true });

    await controller.acceptRequest('bob', mockUser);
    await controller.rejectRequest('bob', mockUser);

    expect(mockService.acceptFollowRequest).toHaveBeenCalledWith(
      'profile-1',
      'bob',
    );
    expect(mockService.rejectFollowRequest).toHaveBeenCalledWith(
      'profile-1',
      'bob',
    );
  });
});
