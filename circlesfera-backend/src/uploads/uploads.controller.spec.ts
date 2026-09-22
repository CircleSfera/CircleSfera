import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

describe('UploadsController', () => {
  let controller: UploadsController;

  const mockUploadsService = {
    uploadFile: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [
        {
          provide: UploadsService,
          useValue: mockUploadsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UploadsController>(UploadsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadFile', () => {
    it('delegates to uploadsService with user.userId', async () => {
      const mockFile: UploadedFile = {
        buffer: Buffer.from('test-image'),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      };
      const mockUser: CurrentUserData = {
        userId: 'user-123',
        email: 'test@example.com',
      } as CurrentUserData;

      const expectedResponse = {
        url: 'https://cdn.example.com/uploads/photo.webp',
        type: 'image',
      };
      mockUploadsService.uploadFile.mockResolvedValueOnce(expectedResponse);

      const result = await controller.uploadFile(mockFile, mockUser);

      expect(mockUploadsService.uploadFile).toHaveBeenCalledWith(
        mockFile,
        'user-123',
      );
      expect(result).toEqual(expectedResponse);
    });

    it('delegates to uploadsService when user is undefined', async () => {
      const mockFile: UploadedFile = {
        buffer: Buffer.from('audio-data'),
        mimetype: 'audio/mp3',
        originalname: 'audio.mp3',
      };

      const expectedResponse = {
        url: 'https://cdn.example.com/uploads/audio.mp3',
        type: 'audio',
      };
      mockUploadsService.uploadFile.mockResolvedValueOnce(expectedResponse);

      const result = await controller.uploadFile(mockFile, undefined);

      expect(mockUploadsService.uploadFile).toHaveBeenCalledWith(
        mockFile,
        undefined,
      );
      expect(result).toEqual(expectedResponse);
    });
  });
});
