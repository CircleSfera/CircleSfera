import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { OwnershipGuard } from '../auth/guards/ownership.guard.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

describe('PostsController', () => {
  let controller: PostsController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const pagination = { page: 1, limit: 10 };

  const mockService = {
    create: vi.fn(),
    findAll: vi.fn(),
    getFramesFeed: vi.fn(),
    findByUser: vi.fn(),
    getTaggedPosts: vi.fn(),
    getByTag: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    adminRemove: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [{ provide: PostsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtOptionalGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OwnershipGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PostsController>(PostsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a post as the caller profile', async () => {
    const dto = { caption: 'Hello' };
    mockService.create.mockResolvedValue({ id: 'post-1' });

    await controller.create(mockUser, dto);

    expect(mockService.create).toHaveBeenCalledWith('profile-1', dto);
  });

  it('lists posts with the viewer profile and strips sort', async () => {
    mockService.findAll.mockResolvedValue({ data: [] });
    const query = { ...pagination, sort: 'trending' as const };

    await controller.findAll(mockUser, query);

    expect(mockService.findAll).toHaveBeenCalledWith(
      pagination,
      'trending',
      'profile-1',
    );
  });

  it('lists posts without a profile when anonymous', async () => {
    mockService.findAll.mockResolvedValue({ data: [] });
    const query = { ...pagination, sort: 'latest' as const };

    await controller.findAll(null, query);

    expect(mockService.findAll).toHaveBeenCalledWith(
      pagination,
      'latest',
      undefined,
    );
  });

  it('loads Frames with the viewer profile when present', async () => {
    mockService.getFramesFeed.mockResolvedValue({ data: [] });

    await controller.getFrames(mockUser, pagination);

    expect(mockService.getFramesFeed).toHaveBeenCalledWith(
      pagination,
      'profile-1',
    );
  });

  it('loads Frames without a profile when anonymous', async () => {
    mockService.getFramesFeed.mockResolvedValue({ data: [] });

    await controller.getFrames(null, pagination);

    expect(mockService.getFramesFeed).toHaveBeenCalledWith(
      pagination,
      undefined,
    );
  });

  it('lists another profile posts with type and viewer profileId', async () => {
    mockService.findByUser.mockResolvedValue({ data: [] });
    const query = { ...pagination, type: 'FRAME' as const };

    await controller.findByUser(mockUser, 'alice', query);

    expect(mockService.findByUser).toHaveBeenCalledWith(
      'alice',
      pagination,
      'FRAME',
      'profile-1',
    );
  });

  it('lists another profile posts without a viewer when anonymous', async () => {
    mockService.findByUser.mockResolvedValue({ data: [] });
    const query = { ...pagination, type: 'POST' as const };

    await controller.findByUser(null, 'alice', query);

    expect(mockService.findByUser).toHaveBeenCalledWith(
      'alice',
      pagination,
      'POST',
      undefined,
    );
  });

  it('loads tagged posts and hashtag posts without a viewer', async () => {
    mockService.getTaggedPosts.mockResolvedValue({ data: [] });
    mockService.getByTag.mockResolvedValue({ data: [] });

    await controller.getTaggedPosts('alice', pagination);
    await controller.getByTag('sfera', pagination);

    expect(mockService.getTaggedPosts).toHaveBeenCalledWith(
      'alice',
      pagination,
    );
    expect(mockService.getByTag).toHaveBeenCalledWith('sfera', pagination);
  });

  it('loads one post with the viewer profile when present', async () => {
    mockService.findOne.mockResolvedValue({ id: 'post-1' });

    await controller.findOne(mockUser, 'post-1');

    expect(mockService.findOne).toHaveBeenCalledWith('post-1', 'profile-1');
  });

  it('loads one post without a profile when anonymous', async () => {
    mockService.findOne.mockResolvedValue({ id: 'post-1' });

    await controller.findOne(null, 'post-1');

    expect(mockService.findOne).toHaveBeenCalledWith('post-1', undefined);
  });

  it('updates and deletes by post id without passing profileId', async () => {
    const dto = { caption: 'Edited' };
    mockService.update.mockResolvedValue({ id: 'post-1' });
    mockService.remove.mockResolvedValue(undefined);

    await controller.update('post-1', dto);
    await controller.remove('post-1');

    expect(mockService.update).toHaveBeenCalledWith('post-1', dto);
    expect(mockService.remove).toHaveBeenCalledWith('post-1');
  });

  it('admin-deletes by post id without a staff profile', async () => {
    mockService.adminRemove.mockResolvedValue(undefined);

    await controller.adminRemove('post-1');

    expect(mockService.adminRemove).toHaveBeenCalledWith('post-1');
  });
});
