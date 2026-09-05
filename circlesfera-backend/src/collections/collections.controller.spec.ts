import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';

describe('CollectionsController', () => {
  let controller: CollectionsController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollectionsController],
      providers: [{ provide: CollectionsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CollectionsController>(CollectionsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates a collection for the caller profile', async () => {
      mockService.create.mockResolvedValue({ id: 'col-1', name: 'Saved' });

      const result = await controller.create(mockUser, {
        name: 'Saved',
        description: 'Inbox',
      });

      expect(mockService.create).toHaveBeenCalledWith('profile-1', {
        name: 'Saved',
        description: 'Inbox',
      });
      expect(result).toEqual({ id: 'col-1', name: 'Saved' });
    });
  });

  describe('findAll', () => {
    it('lists collections for the caller profile', async () => {
      mockService.findAll.mockResolvedValue([]);

      await controller.findAll(mockUser);

      expect(mockService.findAll).toHaveBeenCalledWith('profile-1');
    });
  });

  describe('findOne', () => {
    it('loads a collection scoped to the caller', async () => {
      mockService.findOne.mockResolvedValue({ id: 'col-1' });

      await controller.findOne(mockUser, 'col-1');

      expect(mockService.findOne).toHaveBeenCalledWith('profile-1', 'col-1');
    });
  });

  describe('update', () => {
    it('renames a collection scoped to the caller', async () => {
      mockService.update.mockResolvedValue({ id: 'col-1', name: 'Later' });

      await controller.update(mockUser, 'col-1', { name: 'Later' });

      expect(mockService.update).toHaveBeenCalledWith('profile-1', 'col-1', {
        name: 'Later',
      });
    });
  });

  describe('remove', () => {
    it('deletes a collection scoped to the caller', async () => {
      mockService.delete.mockResolvedValue({ ok: true });

      await controller.remove(mockUser, 'col-1');

      expect(mockService.delete).toHaveBeenCalledWith('profile-1', 'col-1');
    });
  });
});
