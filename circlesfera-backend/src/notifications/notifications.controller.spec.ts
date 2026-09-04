import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    findAll: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists notifications as the caller profile', async () => {
    const pagination = { page: 1, limit: 10 };
    mockService.findAll.mockResolvedValue({ data: [] });

    await controller.findAll(mockUser, pagination);

    expect(mockService.findAll).toHaveBeenCalledWith('profile-1', pagination);
  });

  it('reads unread count as the caller profile', async () => {
    mockService.getUnreadCount.mockResolvedValue({ count: 3 });

    await controller.getUnreadCount(mockUser);

    expect(mockService.getUnreadCount).toHaveBeenCalledWith('profile-1');
  });

  it('marks one notification read as the caller profile', async () => {
    mockService.markAsRead.mockResolvedValue({ id: 'n-1' });

    await controller.markAsRead('n-1', mockUser);

    expect(mockService.markAsRead).toHaveBeenCalledWith('n-1', 'profile-1');
  });

  it('marks all notifications read as the caller profile', async () => {
    mockService.markAllAsRead.mockResolvedValue(undefined);

    const result = await controller.markAllAsRead(mockUser);

    expect(mockService.markAllAsRead).toHaveBeenCalledWith('profile-1');
    expect(result).toEqual({ success: true });
  });
});
