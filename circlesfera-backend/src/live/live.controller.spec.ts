import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { LiveController } from './live.controller.js';
import { LiveService } from './live.service.js';

describe('LiveController', () => {
  let controller: LiveController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockLiveService = {
    startStream: vi.fn(),
    endStream: vi.fn(),
    getActiveStreams: vi.fn(),
    getViewerToken: vi.fn(),
    sendGift: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiveController],
      providers: [{ provide: LiveService, useValue: mockLiveService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(IdentityVerifiedGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LiveController>(LiveController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('startStream', () => {
    it('should call liveService.startStream with profileId', async () => {
      mockLiveService.startStream.mockResolvedValue({
        stream: { id: 'stream-1' },
        token: 'jwt',
      });

      const result = await controller.startStream(mockUser, {
        title: 'My Stream',
      });
      expect(mockLiveService.startStream).toHaveBeenCalledWith(
        'profile-1',
        'My Stream',
      );
      expect(result).toEqual({ stream: { id: 'stream-1' }, token: 'jwt' });
    });
  });

  describe('endStream', () => {
    it('should call liveService.endStream with profileId', async () => {
      mockLiveService.endStream.mockResolvedValue({ success: true });

      const result = await controller.endStream(mockUser);
      expect(mockLiveService.endStream).toHaveBeenCalledWith('profile-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('getActiveStreams', () => {
    it('should call liveService.getActiveStreams', async () => {
      mockLiveService.getActiveStreams.mockResolvedValue([{ id: 'stream-1' }]);

      const result = await controller.getActiveStreams();
      expect(mockLiveService.getActiveStreams).toHaveBeenCalled();
      expect(result).toEqual([{ id: 'stream-1' }]);
    });
  });

  describe('joinStream', () => {
    it('should call liveService.getViewerToken with userId', async () => {
      mockLiveService.getViewerToken.mockResolvedValue({ token: 'jwt-viewer' });

      const result = await controller.joinStream(mockUser, 'stream-1');
      expect(mockLiveService.getViewerToken).toHaveBeenCalledWith(
        'stream-1',
        'user-1',
      );
      expect(result).toEqual({ token: 'jwt-viewer' });
    });
  });
});
