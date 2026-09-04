import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { FeedPreferencesController } from './feed-preferences.controller.js';
import { FeedPreferencesService } from './feed-preferences.service.js';

describe('FeedPreferencesController', () => {
  let controller: FeedPreferencesController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    listPreferences: vi.fn(),
    hidePost: vi.fn(),
    unhidePost: vi.fn(),
    hideAuthor: vi.fn(),
    unhideAuthor: vi.fn(),
    muteKeyword: vi.fn(),
    unmuteKeyword: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeedPreferencesController],
      providers: [{ provide: FeedPreferencesService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FeedPreferencesController>(
      FeedPreferencesController,
    );
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists preferences as the caller profile', async () => {
    mockService.listPreferences.mockResolvedValue({ hiddenPosts: [] });

    await controller.list(mockUser);

    expect(mockService.listPreferences).toHaveBeenCalledWith('profile-1');
  });

  it('hides and unhides a post as the caller profile', async () => {
    mockService.hidePost.mockResolvedValue({ ok: true });
    mockService.unhidePost.mockResolvedValue({ ok: true });

    await controller.hidePost(mockUser, 'post-1');
    await controller.unhidePost(mockUser, 'post-1');

    expect(mockService.hidePost).toHaveBeenCalledWith('profile-1', 'post-1');
    expect(mockService.unhidePost).toHaveBeenCalledWith('profile-1', 'post-1');
  });

  it('hides and unhides an author as the caller profile', async () => {
    mockService.hideAuthor.mockResolvedValue({ ok: true });
    mockService.unhideAuthor.mockResolvedValue({ ok: true });

    await controller.hideAuthor(mockUser, 'author-1');
    await controller.unhideAuthor(mockUser, 'author-1');

    expect(mockService.hideAuthor).toHaveBeenCalledWith(
      'profile-1',
      'author-1',
    );
    expect(mockService.unhideAuthor).toHaveBeenCalledWith(
      'profile-1',
      'author-1',
    );
  });

  it('mutes and unmutes a keyword as the caller profile', async () => {
    mockService.muteKeyword.mockResolvedValue({ ok: true });
    mockService.unmuteKeyword.mockResolvedValue({ ok: true });

    await controller.muteKeyword(mockUser, { keyword: 'spoiler' });
    await controller.unmuteKeyword(mockUser, 'spoiler');

    expect(mockService.muteKeyword).toHaveBeenCalledWith(
      'profile-1',
      'spoiler',
    );
    expect(mockService.unmuteKeyword).toHaveBeenCalledWith(
      'profile-1',
      'spoiler',
    );
  });
});
