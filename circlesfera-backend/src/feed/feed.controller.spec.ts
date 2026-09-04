import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';

describe('FeedController', () => {
  let controller: FeedController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const pagination = { page: 1, limit: 10 };

  const mockService = {
    getHybridFeed: vi.fn(),
    getFollowingFeed: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeedController],
      providers: [{ provide: FeedService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtOptionalGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FeedController>(FeedController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('loads For You with the viewer profile and userId', async () => {
    mockService.getHybridFeed.mockResolvedValue({ data: [] });

    await controller.getForYou(mockUser, pagination);

    expect(mockService.getHybridFeed).toHaveBeenCalledWith(
      'profile-1',
      pagination,
      'user-1',
    );
  });

  it('loads For You without a profile when anonymous', async () => {
    mockService.getHybridFeed.mockResolvedValue({ data: [] });

    await controller.getForYou(null, pagination);

    expect(mockService.getHybridFeed).toHaveBeenCalledWith(
      null,
      pagination,
      null,
    );
  });

  it('loads Following as the caller profile', async () => {
    mockService.getFollowingFeed.mockResolvedValue({ data: [] });

    await controller.getFollowing(mockUser, pagination);

    expect(mockService.getFollowingFeed).toHaveBeenCalledWith(
      'profile-1',
      pagination,
    );
  });

  it('returns an empty Following page without hitting the service when anonymous', async () => {
    const result = await controller.getFollowing(null, pagination);

    expect(mockService.getFollowingFeed).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
    });
  });
});
