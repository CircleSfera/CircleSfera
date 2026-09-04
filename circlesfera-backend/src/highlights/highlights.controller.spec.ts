import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { HighlightsController } from './highlights.controller.js';
import { HighlightsService } from './highlights.service.js';

describe('HighlightsController', () => {
  let controller: HighlightsController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    create: vi.fn(),
    update: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HighlightsController],
      providers: [{ provide: HighlightsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HighlightsController>(HighlightsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates a highlight for the caller profile', async () => {
      const dto = { title: 'Travel', storyIds: ['story-1'] };
      mockService.create.mockResolvedValue({ id: 'hl-1', ...dto });

      const result = await controller.create(mockUser, dto);

      expect(mockService.create).toHaveBeenCalledWith('profile-1', dto);
      expect(result).toEqual({ id: 'hl-1', ...dto });
    });
  });

  describe('update', () => {
    it('updates a highlight owned by the caller', async () => {
      const dto = { title: 'Updated' };
      mockService.update.mockResolvedValue({ id: 'hl-1', ...dto });

      await controller.update(mockUser, 'hl-1', dto);

      expect(mockService.update).toHaveBeenCalledWith('hl-1', 'profile-1', dto);
    });
  });

  describe('findAll', () => {
    it('lists highlights for a public profile id', async () => {
      mockService.findAll.mockResolvedValue([]);

      await controller.findAll('profile-9');

      expect(mockService.findAll).toHaveBeenCalledWith('profile-9');
    });
  });

  describe('findAllLegacy', () => {
    it('keeps the deprecated user/:profileId path on the same query', async () => {
      mockService.findAll.mockResolvedValue([]);

      await controller.findAllLegacy('profile-9');

      expect(mockService.findAll).toHaveBeenCalledWith('profile-9');
    });
  });

  describe('findOne', () => {
    it('loads a highlight by id without requiring the caller profile', async () => {
      mockService.findOne.mockResolvedValue({ id: 'hl-1' });

      await controller.findOne('hl-1');

      expect(mockService.findOne).toHaveBeenCalledWith('hl-1');
    });
  });

  describe('remove', () => {
    it('deletes a highlight owned by the caller', async () => {
      mockService.remove.mockResolvedValue({ ok: true });

      await controller.remove(mockUser, 'hl-1');

      expect(mockService.remove).toHaveBeenCalledWith('hl-1', 'profile-1');
    });
  });
});
