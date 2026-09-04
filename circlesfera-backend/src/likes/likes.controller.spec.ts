import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { LikesController } from './likes.controller.js';
import { LikesService } from './likes.service.js';

describe('LikesController', () => {
  let controller: LikesController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    toggle: vi.fn(),
    checkLike: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LikesController],
      providers: [{ provide: LikesService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LikesController>(LikesController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('toggles like with postId, profileId and userId', async () => {
    mockService.toggle.mockResolvedValue({ liked: true });

    await controller.toggle('post-1', mockUser);

    expect(mockService.toggle).toHaveBeenCalledWith(
      'post-1',
      'profile-1',
      'user-1',
    );
  });

  it('checks like with the caller profileId', async () => {
    mockService.checkLike.mockResolvedValue({ liked: false });

    await controller.check('post-1', mockUser);

    expect(mockService.checkLike).toHaveBeenCalledWith('post-1', 'profile-1');
  });
});
