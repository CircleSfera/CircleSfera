import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { EditsService } from './edits.service.js';

describe('EditsService', () => {
  let service: EditsService;

  const mockPrismaService = {
    editProject: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    featureFlag: {
      findUnique: vi.fn(),
    },
  };

  const mockUploadsService = {
    deleteFile: vi.fn().mockResolvedValue(true),
  };

  const mockAiService = {
    transcribeAudio: vi.fn(),
    isConfigured: vi.fn().mockReturnValue(true),
  };

  const mockAiQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    getJob: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EditsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: UploadsService, useValue: mockUploadsService },
        { provide: AIService, useValue: mockAiService },
        { provide: getQueueToken('ai-processing'), useValue: mockAiQueue },
      ],
    }).compile();

    service = module.get<EditsService>(EditsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an edit project', async () => {
      const dto = {
        mediaUrl: 'https://cdn.example.com/photo.jpg',
        mediaType: 'image',
        name: 'My Edit Project',
        state: { filter: 'vintage' },
      };

      mockPrismaService.editProject.create.mockResolvedValue({
        id: 'edit-1',
        userId: 'user-1',
        ...dto,
      });

      const result = await service.create('user-1', dto);
      expect(mockPrismaService.editProject.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          mediaUrl: dto.mediaUrl,
          mediaType: 'image',
          name: dto.name,
          state: dto.state,
        },
      });
      expect(result).toHaveProperty('id', 'edit-1');
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if edit project does not exist', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'invalid-id')).rejects.toThrow(
        AppException,
      );
    });
  });

  describe('startCaptions', () => {
    it('queues a transcription job for a remote clip', async () => {
      mockPrismaService.featureFlag.findUnique.mockResolvedValue(null);
      mockPrismaService.editProject.findFirst.mockResolvedValue({
        id: 'edit-1',
        userId: 'user-1',
        state: {
          version: 3,
          studio: {
            tracks: [
              {
                clips: [
                  {
                    id: 'clip-1',
                    type: 'video',
                    fileUrl: 'https://cdn.example.com/v.mp4',
                  },
                ],
              },
            ],
          },
        },
      });

      const result = await service.startCaptions('user-1', 'edit-1', 'clip-1');
      expect(result).toEqual({ jobId: 'job-1', status: 'queued' });
      expect(mockAiQueue.add).toHaveBeenCalledWith(
        'transcribe-edit-clip',
        expect.objectContaining({
          userId: 'user-1',
          editId: 'edit-1',
          clipId: 'clip-1',
          mediaUrl: 'https://cdn.example.com/v.mp4',
        }),
        expect.any(Object),
      );
    });

    it('rejects when feature flag kill switch is off', async () => {
      mockPrismaService.featureFlag.findUnique.mockResolvedValue({
        key: 'studio_ai_captions',
        isEnabled: false,
      });

      await expect(
        service.startCaptions('user-1', 'edit-1', 'clip-1'),
      ).rejects.toThrow(AppException);
    });
  });

  describe('remove', () => {
    it('deletes mediaUrl and clip fileUrls from v3 studio state', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({
        id: 'edit-1',
        userId: 'user-1',
        mediaUrl: 'https://cdn.example.com/cover.mp4',
        state: {
          version: 3,
          studio: {
            tracks: [
              {
                clips: [
                  {
                    type: 'video',
                    fileUrl: 'https://cdn.example.com/clip-a.mp4',
                  },
                  {
                    type: 'image',
                    fileUrl: 'https://cdn.example.com/clip-b.jpg',
                  },
                  { type: 'text', content: 'hi' },
                ],
              },
            ],
          },
        },
      });
      mockPrismaService.editProject.delete.mockResolvedValue({});

      await service.remove('user-1', 'edit-1');

      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/cover.mp4',
      );
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/clip-a.mp4',
      );
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/clip-b.jpg',
      );
      expect(mockPrismaService.editProject.delete).toHaveBeenCalled();
    });
  });
});
