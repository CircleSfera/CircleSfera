import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { BookmarksController } from './bookmarks.controller.js';
import { BookmarksService } from './bookmarks.service.js';

describe('BookmarksController', () => {
  let controller: BookmarksController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    toggle: vi.fn(),
    updateCollection: vi.fn(),
    getBookmarks: vi.fn(),
    check: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookmarksController],
      providers: [{ provide: BookmarksService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BookmarksController>(BookmarksController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('toggle', () => {
    it('delegates to service with profileId, postId and optional collection', async () => {
      mockService.toggle.mockResolvedValue({ bookmarked: true });

      const result = await controller.toggle(mockUser, 'post-1', 'col-1');

      expect(mockService.toggle).toHaveBeenCalledWith(
        'profile-1',
        'post-1',
        'col-1',
      );
      expect(result).toEqual({ bookmarked: true });
    });
  });

  describe('updateCollection', () => {
    it('moves a bookmark using the caller profileId', async () => {
      mockService.updateCollection.mockResolvedValue({ ok: true });

      const result = await controller.updateCollection(
        mockUser,
        'post-1',
        'col-2',
      );

      expect(mockService.updateCollection).toHaveBeenCalledWith(
        'profile-1',
        'post-1',
        'col-2',
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe('getBookmarks', () => {
    it('parses pagination and filters by collection', async () => {
      mockService.getBookmarks.mockResolvedValue({ data: [] });

      await controller.getBookmarks(mockUser, 2, 20, 'col-1');

      expect(mockService.getBookmarks).toHaveBeenCalledWith(
        'profile-1',
        2,
        20,
        'col-1',
      );
    });
  });

  describe('check', () => {
    it('delegates bookmark check to the service', async () => {
      mockService.check.mockResolvedValue({ bookmarked: false });

      const result = await controller.check(mockUser, 'post-9');

      expect(mockService.check).toHaveBeenCalledWith('profile-1', 'post-9');
      expect(result).toEqual({ bookmarked: false });
    });
  });
});
