import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveController } from './live.controller.js';
import { LiveService } from './live.service.js';

describe('LiveController', () => {
  let controller: LiveController;

  const mockLiveService = {
    startStream: vi.fn(),
    endStream: vi.fn(),
    getActiveStreams: vi.fn(),
    getViewerToken: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiveController],
      providers: [{ provide: LiveService, useValue: mockLiveService }],
    }).compile();

    controller = module.get<LiveController>(LiveController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('startStream', () => {
    it('should call liveService.startStream', async () => {
      const mockReq = {
        user: { userId: 'user-1', email: 'test@example.com', role: 'USER' },
      } as any;
      mockLiveService.startStream.mockResolvedValue({
        stream: { id: 'stream-1' },
        token: 'jwt',
      });

      const result = await controller.startStream(mockReq, {
        title: 'My Stream',
      });
      expect(mockLiveService.startStream).toHaveBeenCalledWith(
        'user-1',
        'My Stream',
      );
      expect(result).toEqual({ stream: { id: 'stream-1' }, token: 'jwt' });
    });
  });

  describe('endStream', () => {
    it('should call liveService.endStream', async () => {
      const mockReq = {
        user: { userId: 'user-1', email: 'test@example.com', role: 'USER' },
      } as any;
      mockLiveService.endStream.mockResolvedValue({ success: true });

      const result = await controller.endStream(mockReq);
      expect(mockLiveService.endStream).toHaveBeenCalledWith('user-1');
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
    it('should call liveService.getViewerToken', async () => {
      const mockReq = {
        user: { userId: 'user-2', email: 'viewer@example.com', role: 'USER' },
      } as any;
      mockLiveService.getViewerToken.mockResolvedValue({ token: 'jwt-viewer' });

      const result = await controller.joinStream(mockReq, 'stream-1');
      expect(mockLiveService.getViewerToken).toHaveBeenCalledWith(
        'stream-1',
        'user-2',
      );
      expect(result).toEqual({ token: 'jwt-viewer' });
    });
  });
});
