import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { StoriesController } from './stories.controller.js';
import { StoriesService } from './stories.service.js';

describe('StoriesController', () => {
  let controller: StoriesController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findByUser: vi.fn(),
    getArchive: vi.fn(),
    delete: vi.fn(),
    view: vi.fn(),
    getViews: vi.fn(),
    addReaction: vi.fn(),
    getReactions: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoriesController],
      providers: [{ provide: StoriesService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtOptionalGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StoriesController>(StoriesController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a story as the caller profile', async () => {
    const dto = { url: 'https://cdn.example/story.jpg' };
    mockService.create.mockResolvedValue({ id: 'story-1' });

    await controller.create(mockUser, dto);

    expect(mockService.create).toHaveBeenCalledWith('profile-1', dto);
  });

  it('lists the feed with the viewer profile when present', async () => {
    mockService.findAll.mockResolvedValue([]);

    await controller.findAll(mockUser);

    expect(mockService.findAll).toHaveBeenCalledWith('profile-1');
  });

  it('lists the feed without a profile when anonymous', async () => {
    mockService.findAll.mockResolvedValue([]);

    await controller.findAll(null);

    expect(mockService.findAll).toHaveBeenCalledWith(undefined);
  });

  it('loads another profile stories with the viewer profileId', async () => {
    mockService.findByUser.mockResolvedValue([]);

    await controller.findByUser(mockUser, 'alice');

    expect(mockService.findByUser).toHaveBeenCalledWith('alice', 'profile-1');
  });

  it('reads the archive, deletes and records a view as the caller profile', async () => {
    mockService.getArchive.mockResolvedValue([]);
    mockService.delete.mockResolvedValue(undefined);
    mockService.view.mockResolvedValue({ id: 'view-1' });

    await controller.getArchive(mockUser);
    await controller.remove(mockUser, 'story-1');
    await controller.view(mockUser, 'story-1');

    expect(mockService.getArchive).toHaveBeenCalledWith('profile-1');
    expect(mockService.delete).toHaveBeenCalledWith('story-1', 'profile-1');
    expect(mockService.view).toHaveBeenCalledWith('story-1', 'profile-1');
  });

  it('reacts as the caller profile', async () => {
    mockService.addReaction.mockResolvedValue({ id: 'rx-1' });

    await controller.react(mockUser, 'story-1', { reaction: '❤️' });

    expect(mockService.addReaction).toHaveBeenCalledWith(
      'story-1',
      'profile-1',
      '❤️',
    );
  });
});
