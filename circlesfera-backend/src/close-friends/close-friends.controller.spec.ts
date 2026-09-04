import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { CloseFriendsController } from './close-friends.controller.js';
import { CloseFriendsService } from './close-friends.service.js';

describe('CloseFriendsController', () => {
  let controller: CloseFriendsController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    getCloseFriends: vi.fn(),
    toggleCloseFriend: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CloseFriendsController],
      providers: [{ provide: CloseFriendsService, useValue: mockService }],
    }).compile();

    controller = module.get<CloseFriendsController>(CloseFriendsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCloseFriends', () => {
    it('delegates to service with profileId', async () => {
      mockService.getCloseFriends.mockResolvedValue([{ id: 'friend-1' }]);

      const result = await controller.getCloseFriends(mockUser);

      expect(mockService.getCloseFriends).toHaveBeenCalledWith('profile-1');
      expect(result).toEqual([{ id: 'friend-1' }]);
    });
  });

  describe('toggleCloseFriend', () => {
    it('delegates to service with profileId and friendId', async () => {
      mockService.toggleCloseFriend.mockResolvedValue({ isCloseFriend: true });

      const result = await controller.toggleCloseFriend(mockUser, 'friend-2');

      expect(mockService.toggleCloseFriend).toHaveBeenCalledWith(
        'profile-1',
        'friend-2',
      );
      expect(result).toEqual({ isCloseFriend: true });
    });
  });
});
