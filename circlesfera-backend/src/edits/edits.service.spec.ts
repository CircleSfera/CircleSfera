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
        profileId: 'profile-1',
        ...dto,
      });

      const result = await service.create('profile-1', dto);
      expect(mockPrismaService.editProject.create).toHaveBeenCalledWith({
        data: {
          profileId: 'profile-1',
          mediaUrl: dto.mediaUrl,
          mediaType: 'image',
          name: dto.name,
          state: dto.state,
        },
      });
      expect(result).toHaveProperty('id', 'edit-1');
    });

    it('throws HttpException when editProject model is missing', async () => {
      const saved = mockPrismaService.editProject;
      (mockPrismaService as any).editProject = undefined;

      await expect(
        service.create('profile-1', { name: 'Test' } as any),
      ).rejects.toThrow();

      mockPrismaService.editProject = saved;
    });

    it('throws HttpException when creation query fails', async () => {
      mockPrismaService.editProject.create.mockRejectedValueOnce(
        new Error('DB crash'),
      );

      await expect(
        service.create('profile-1', { name: 'Test' } as any),
      ).rejects.toThrow();
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
        profileId: 'profile-1',
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

      const result = await service.startCaptions(
        'profile-1',
        'edit-1',
        'clip-1',
      );
      expect(result).toEqual({ jobId: 'job-1', status: 'queued' });
      expect(mockAiQueue.add).toHaveBeenCalledWith(
        'transcribe-edit-clip',
        expect.objectContaining({
          profileId: 'profile-1',
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

  describe('findAll', () => {
    it('returns all edit projects for a profile', async () => {
      mockPrismaService.editProject.findMany.mockResolvedValue([
        { id: 'e-1', name: 'Project 1' },
      ]);

      const result = await service.findAll('p-1');
      expect(result).toHaveLength(1);
      expect(mockPrismaService.editProject.findMany).toHaveBeenCalledWith({
        where: { profileId: 'p-1' },
        orderBy: { updatedAt: 'desc' },
      });
    });
  });

  describe('update', () => {
    it('updates project name and state', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({
        id: 'e-1',
        name: 'Old Name',
        state: { v: 1 },
      });
      mockPrismaService.editProject.update.mockResolvedValue({
        id: 'e-1',
        name: 'New Name',
        state: { v: 2 },
      });

      const res = await service.update('p-1', 'e-1', {
        name: 'New Name',
        state: { v: 2 } as any,
      });
      expect(res.name).toBe('New Name');
      expect(mockPrismaService.editProject.update).toHaveBeenCalledWith({
        where: { id: 'e-1' },
        data: { name: 'New Name', state: { v: 2 } },
      });

      // Update with no fields provided keeps existing
      await service.update('p-1', 'e-1', {});
      expect(mockPrismaService.editProject.update).toHaveBeenCalledWith({
        where: { id: 'e-1' },
        data: { name: 'Old Name', state: { v: 1 } },
      });
    });
  });

  describe('startCaptions edge cases', () => {
    it('throws SERVICE_UNAVAILABLE when AI service is not configured', async () => {
      mockPrismaService.featureFlag.findUnique.mockResolvedValue(null);
      mockAiService.isConfigured.mockReturnValueOnce(false);

      await expect(
        service.startCaptions('p-1', 'e-1', 'clip-1'),
      ).rejects.toThrow();
    });

    it('throws BadRequest when clip has no media URL or blob/data url', async () => {
      mockPrismaService.featureFlag.findUnique.mockResolvedValue(null);
      mockAiService.isConfigured.mockReturnValue(true);
      mockPrismaService.editProject.findFirst.mockResolvedValue({
        id: 'e-1',
        state: {
          version: 3,
          studio: {
            tracks: [
              {
                clips: [{ id: 'clip-blob', fileUrl: 'blob:https://xyz' }],
              },
            ],
          },
        },
      });

      await expect(
        service.startCaptions('p-1', 'e-1', 'clip-blob'),
      ).rejects.toThrow(AppException);

      await expect(
        service.startCaptions('p-1', 'e-1', 'clip-missing'),
      ).rejects.toThrow(AppException);
    });
  });

  describe('getCaptionsJob', () => {
    it('throws NotFound if job is not in queue', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({ id: 'e-1' });
      mockAiQueue.getJob.mockResolvedValueOnce(null);

      await expect(
        service.getCaptionsJob('p-1', 'e-1', 'job-none'),
      ).rejects.toThrow(AppException);
    });

    it('throws Forbidden if job does not belong to caller or project', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({ id: 'e-1' });
      mockAiQueue.getJob.mockResolvedValueOnce({
        data: { profileId: 'other-p', editId: 'e-1' },
      });

      await expect(
        service.getCaptionsJob('p-1', 'e-1', 'job-other'),
      ).rejects.toThrow(AppException);
    });

    it('returns completed status and segments when job succeeds', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({ id: 'e-1' });
      mockAiQueue.getJob.mockResolvedValueOnce({
        data: { profileId: 'p-1', editId: 'e-1' },
        getState: vi.fn().mockResolvedValue('completed'),
        returnvalue: { segments: [{ start: 0, text: 'Hello' }] },
      });

      const res = await service.getCaptionsJob('p-1', 'e-1', 'job-ok');
      expect(res).toEqual({
        status: 'completed',
        segments: [{ start: 0, text: 'Hello' }],
      });
    });

    it('returns failed status and error message when job fails', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({ id: 'e-1' });
      mockAiQueue.getJob.mockResolvedValueOnce({
        data: { profileId: 'p-1', editId: 'e-1' },
        getState: vi.fn().mockResolvedValue('failed'),
        failedReason: 'Audio too noisy',
      });

      const res = await service.getCaptionsJob('p-1', 'e-1', 'job-fail');
      expect(res).toEqual({
        status: 'failed',
        error: 'Audio too noisy',
      });
    });

    it('returns raw status for active/waiting jobs', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({ id: 'e-1' });
      mockAiQueue.getJob.mockResolvedValueOnce({
        data: { profileId: 'p-1', editId: 'e-1' },
        getState: vi.fn().mockResolvedValue('active'),
      });

      const res = await service.getCaptionsJob('p-1', 'e-1', 'job-active');
      expect(res).toEqual({ status: 'active' });
    });
  });

  describe('cleanupAbandonedDrafts', () => {
    it('finds and deletes abandoned drafts and their studio media', async () => {
      mockPrismaService.editProject.findMany.mockResolvedValue([
        {
          id: 'old-1',
          mediaUrl: 'https://cdn.example.com/draft.mp4',
          state: {
            version: 3,
            studio: {
              tracks: [
                {
                  clips: [
                    { fileUrl: 'https://cdn.example.com/clip.mp4' },
                    { fileUrl: 'blob:https://test.com' },
                    { fileUrl: 'data:image/png;base64,...' },
                    { type: 'text', content: 'hello' },
                    { type: 'video' },
                  ],
                },
              ],
            },
          },
        },
      ]);
      mockPrismaService.editProject.deleteMany.mockResolvedValue({ count: 1 });

      const res = await service.cleanupAbandonedDrafts();
      expect(res.count).toBe(1);
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/draft.mp4',
      );
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/clip.mp4',
      );
    });

    it('handles zero deleted drafts without logging count', async () => {
      mockPrismaService.editProject.findMany.mockResolvedValue([]);
      mockPrismaService.editProject.deleteMany.mockResolvedValue({ count: 0 });

      const res = await service.cleanupAbandonedDrafts();
      expect(res.count).toBe(0);
    });

    it('catches and rethrows errors during cleanup', async () => {
      mockPrismaService.editProject.findMany.mockRejectedValue(
        new Error('DB failure'),
      );

      await expect(service.cleanupAbandonedDrafts()).rejects.toThrow(
        'DB failure',
      );
    });
  });

  describe('deleteProjectMedia error resilience and state branches', () => {
    it('catches upload deletion failures gracefully', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({
        id: 'edit-err',
        mediaUrl: 'https://cdn.example.com/broken.mp4',
        state: null,
      });
      mockUploadsService.deleteFile.mockRejectedValueOnce(
        new Error('S3 delete error'),
      );
      mockPrismaService.editProject.delete.mockResolvedValue({});

      const res = await service.remove('u-1', 'edit-err');
      expect(res.success).toBe(true);
    });

    it('handles invalid or legacy states in remove and findClipMediaUrl', async () => {
      // Version not 3
      mockPrismaService.editProject.findFirst.mockResolvedValueOnce({
        id: 'edit-legacy',
        mediaUrl: null,
        state: { version: 2 },
      });
      await service.remove('u-1', 'edit-legacy');

      // Studio without tracks
      mockPrismaService.editProject.findFirst.mockResolvedValueOnce({
        id: 'edit-notracks',
        mediaUrl: null,
        state: { version: 3, studio: {} },
      });
      await service.remove('u-1', 'edit-notracks');

      // Non-object state in startCaptions
      mockPrismaService.featureFlag.findUnique.mockResolvedValue(null);
      mockAiService.isConfigured.mockReturnValue(true);
      mockPrismaService.editProject.findFirst.mockResolvedValueOnce({
        id: 'e-bad-state',
        state: 'raw-string',
      });
      await expect(
        service.startCaptions('u-1', 'e-bad-state', 'c-1'),
      ).rejects.toThrow(AppException);

      // Studio without tracks in startCaptions
      mockPrismaService.editProject.findFirst.mockResolvedValueOnce({
        id: 'e-no-tracks',
        state: { version: 3, studio: {} },
      });
      await expect(
        service.startCaptions('u-1', 'e-no-tracks', 'c-1'),
      ).rejects.toThrow(AppException);

      // Data url in clip
      mockPrismaService.editProject.findFirst.mockResolvedValueOnce({
        id: 'e-data-url',
        state: {
          version: 3,
          studio: {
            tracks: [
              {
                clips: [{ id: 'c-data', fileUrl: 'data:video/mp4;base64,abc' }],
              },
            ],
          },
        },
      });
      await expect(
        service.startCaptions('u-1', 'e-data-url', 'c-data'),
      ).rejects.toThrow(AppException);
    });
  });
});
