import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StoredFilesService } from '../uploads/services/stored-files.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { EditsService } from './edits.service.js';

// Every file in these tests is the sending Profile's own unless a test says so.
const mockStoredFiles = {
  assertOwnedBy: vi.fn().mockResolvedValue(undefined),
  record: vi.fn().mockResolvedValue(undefined),
};

describe('EditsService', () => {
  let service: EditsService;

  const mockPrismaService: any = {
    $transaction: vi.fn((cb) => cb(mockPrismaService)),
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
    releaseContentFiles: vi.fn().mockResolvedValue(undefined),
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
        { provide: StoredFilesService, useValue: mockStoredFiles },
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
    it("refuses another Profile's stored file, the project's media or a clip", async () => {
      mockStoredFiles.assertOwnedBy.mockRejectedValueOnce(
        new Error('FILE_NOT_OWNED'),
      );

      await expect(
        service.create('p-1', {
          mediaUrl: '/uploads/m.mp4',
          mediaType: 'video',
          state: {
            version: 3,
            studio: { tracks: [{ clips: [{ fileUrl: '/uploads/c.mp4' }] }] },
          },
        } as never),
      ).rejects.toThrow('FILE_NOT_OWNED');
      expect(mockStoredFiles.assertOwnedBy).toHaveBeenCalledWith('p-1', [
        '/uploads/m.mp4',
        '/uploads/c.mp4',
      ]);
      expect(mockPrismaService.editProject.create).not.toHaveBeenCalled();
    });

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
    it('deletes the project and keeps its media and clip files for 30 days', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({
        id: 'edit-1',
        profileId: 'user-1',
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
                  // Still on the device: never a stored file of this server.
                  { type: 'image', fileUrl: 'blob:https://app/clip-c' },
                  { type: 'image', fileUrl: 'data:image/png;base64,AAAA' },
                ],
              },
            ],
          },
        },
      });
      const tx = { editProject: { delete: vi.fn().mockResolvedValue({}) } };
      mockPrismaService.$transaction.mockImplementationOnce(
        (cb: (t: unknown) => unknown) => cb(tx),
      );

      await service.remove('user-1', 'edit-1');

      expect(tx.editProject.delete).toHaveBeenCalledWith({
        where: { id: 'edit-1' },
      });
      expect(mockPrismaService.editProject.delete).not.toHaveBeenCalled();

      // Its files are kept 30 days, then erased (PD-040): none goes now.
      // They are settled in the transaction that deletes the row.
      expect(mockUploadsService.releaseContentFiles).toHaveBeenCalledWith(
        [
          'https://cdn.example.com/cover.mp4',
          'https://cdn.example.com/clip-a.mp4',
          'https://cdn.example.com/clip-b.jpg',
        ],
        tx,
      );
      expect(mockUploadsService.deleteFile).not.toHaveBeenCalled();
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
    it('checks only clips added to the project, and refuses one of another Profile', async () => {
      const clips = (...urls: string[]) => ({
        version: 3,
        studio: { tracks: [{ clips: urls.map((fileUrl) => ({ fileUrl })) }] },
      });
      mockPrismaService.editProject.findFirst.mockResolvedValue({
        id: 'e-1',
        state: clips('/uploads/kept.mp4'),
      });
      mockStoredFiles.assertOwnedBy.mockRejectedValueOnce(
        new Error('FILE_NOT_OWNED'),
      );

      await expect(
        service.update('p-1', 'e-1', {
          state: clips('/uploads/kept.mp4', '/uploads/added.mp4'),
        } as never),
      ).rejects.toThrow('FILE_NOT_OWNED');
      expect(mockStoredFiles.assertOwnedBy).toHaveBeenCalledWith('p-1', [
        '/uploads/added.mp4',
      ]);
      expect(mockPrismaService.editProject.update).not.toHaveBeenCalled();
    });

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

  describe('deleteProjectMedia error resilience and state branches', () => {
    it('fails, and so keeps the project, when its files cannot be settled', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({
        id: 'edit-err',
        profileId: 'u-1',
        mediaUrl: 'https://cdn.example.com/broken.mp4',
        state: null,
      });
      mockUploadsService.releaseContentFiles.mockRejectedValueOnce(
        new Error('S3 delete error'),
      );
      mockPrismaService.editProject.delete.mockResolvedValue({});

      await expect(service.remove('u-1', 'edit-err')).rejects.toThrow(
        'S3 delete error',
      );
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
