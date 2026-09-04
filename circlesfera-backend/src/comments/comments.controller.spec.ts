import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

describe('CommentsController', () => {
  let controller: CommentsController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    create: vi.fn(),
    findByPost: vi.fn(),
    remove: vi.fn(),
    likeComment: vi.fn(),
    unlikeComment: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [{ provide: CommentsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtOptionalGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CommentsController>(CommentsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a comment as the caller profile', async () => {
    const dto = { content: 'Nice shot' };
    mockService.create.mockResolvedValue({ id: 'c-1', ...dto });

    await controller.create('post-1', mockUser, dto);

    expect(mockService.create).toHaveBeenCalledWith('post-1', 'profile-1', dto);
  });

  it('lists comments with the viewer profile when present', async () => {
    mockService.findByPost.mockResolvedValue({ data: [] });
    const pagination = { page: 1, limit: 10 };

    await controller.findByPost('post-1', pagination, mockUser);

    expect(mockService.findByPost).toHaveBeenCalledWith(
      'post-1',
      pagination,
      'profile-1',
    );
  });

  it('lists comments without a profile when the viewer is anonymous', async () => {
    mockService.findByPost.mockResolvedValue({ data: [] });
    const pagination = { page: 1, limit: 10 };

    await controller.findByPost('post-1', pagination, null);

    expect(mockService.findByPost).toHaveBeenCalledWith(
      'post-1',
      pagination,
      undefined,
    );
  });

  it('deletes a comment as the caller profile', async () => {
    mockService.remove.mockResolvedValue(undefined);

    await controller.remove('c-1', mockUser);

    expect(mockService.remove).toHaveBeenCalledWith('c-1', 'profile-1');
  });

  it('likes and unlikes a comment as the caller profile', async () => {
    mockService.likeComment.mockResolvedValue(undefined);
    mockService.unlikeComment.mockResolvedValue(undefined);

    await controller.likeComment('c-1', mockUser);
    await controller.unlikeComment('c-1', mockUser);

    expect(mockService.likeComment).toHaveBeenCalledWith('c-1', 'profile-1');
    expect(mockService.unlikeComment).toHaveBeenCalledWith('c-1', 'profile-1');
  });
});
