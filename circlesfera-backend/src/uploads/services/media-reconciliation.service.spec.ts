import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageProvider } from '../interfaces/storage-provider.interface.js';
import type { UploadsService } from '../uploads.service.js';
import { MediaReconciliationService } from './media-reconciliation.service.js';

describe('MediaReconciliationService', () => {
  let service: MediaReconciliationService;
  let mockPrisma: any;
  let mockUploadsService: {
    scheduleMediaDeletion: ReturnType<typeof vi.fn>;
  };
  let mockStorageProvider: {
    upload: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    listFiles?: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      postMedia: { findMany: vi.fn().mockResolvedValue([]) },
      profile: { findMany: vi.fn().mockResolvedValue([]) },
      story: { findMany: vi.fn().mockResolvedValue([]) },
      message: { findMany: vi.fn().mockResolvedValue([]) },
      liveGift: { findMany: vi.fn().mockResolvedValue([]) },
      audio: { findMany: vi.fn().mockResolvedValue([]) },
    };

    mockUploadsService = {
      scheduleMediaDeletion: vi.fn().mockResolvedValue(undefined),
    };

    mockStorageProvider = {
      upload: vi.fn(),
      delete: vi.fn(),
      listFiles: vi.fn().mockResolvedValue([]),
    };

    service = new MediaReconciliationService(
      mockPrisma as unknown as PrismaService,
      mockUploadsService as unknown as UploadsService,
      mockStorageProvider as unknown as StorageProvider,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should collect referenced keys across all media entities', async () => {
    mockPrisma.postMedia.findMany.mockResolvedValue([
      {
        url: '/uploads/post1.png',
        standardUrl: '/uploads/post1_std.webp',
        thumbnailUrl: '/uploads/post1_thumb.webp',
      },
    ]);
    mockPrisma.profile.findMany.mockResolvedValue([
      {
        avatar: '/uploads/avatar.jpg',
        standardUrl: null,
        thumbnailUrl: null,
        cover: '/uploads/cover.jpg',
        coverStandardUrl: null,
        coverThumbnailUrl: null,
      },
    ]);
    mockPrisma.story.findMany.mockResolvedValue([
      {
        url: '/uploads/story.mp4',
        standardUrl: null,
        thumbnailUrl: '/uploads/story_thumb.jpg',
      },
    ]);
    mockPrisma.message.findMany.mockResolvedValue([
      { attachmentUrl: '/uploads/chat_file.pdf', thumbnailUrl: null },
    ]);
    mockPrisma.audio.findMany.mockResolvedValue([
      { url: '/uploads/song.mp3', thumbnailUrl: '/uploads/song_thumb.jpg' },
    ]);

    const keys = await service.getReferencedMediaKeys();

    expect(keys.has('/uploads/post1.png')).toBe(true);
    expect(keys.has('post1.png')).toBe(true);
    expect(keys.has('/uploads/avatar.jpg')).toBe(true);
    expect(keys.has('/uploads/cover.jpg')).toBe(true);
    expect(keys.has('/uploads/story.mp4')).toBe(true);
    expect(keys.has('/uploads/chat_file.pdf')).toBe(true);
    expect(keys.has('/uploads/song.mp3')).toBe(true);
    expect(keys.has('/uploads/song_thumb.jpg')).toBe(true);
  });

  it('should skip reconciliation if storage provider does not implement listFiles', async () => {
    delete mockStorageProvider.listFiles;

    const result = await service.detectAndReconcileOrphans();

    expect(result.scannedCount).toBe(0);
    expect(result.orphanCount).toBe(0);
    expect(result.reconciled).toBe(false);
    expect(mockUploadsService.scheduleMediaDeletion).not.toHaveBeenCalled();
  });

  it('should detect orphan files older than grace period and schedule cleanup when dryRun is false', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
    const oneHourAgo = new Date(Date.now() - 1 * 3600 * 1000);

    mockPrisma.postMedia.findMany.mockResolvedValue([
      { url: '/uploads/active.png', standardUrl: null, thumbnailUrl: null },
    ]);

    mockStorageProvider.listFiles!.mockResolvedValue([
      { url: '/uploads/active.png', lastModified: twoDaysAgo, sizeBytes: 1000 },
      {
        url: '/uploads/orphan-old.png',
        lastModified: twoDaysAgo,
        sizeBytes: 5000,
      },
      {
        url: '/uploads/in-flight-fresh.png',
        lastModified: oneHourAgo,
        sizeBytes: 2000,
      },
    ]);

    const result = await service.detectAndReconcileOrphans({
      olderThanHours: 24,
      dryRun: false,
    });

    expect(result.scannedCount).toBe(3);
    expect(result.orphanCount).toBe(1);
    expect(result.orphans[0].url).toBe('/uploads/orphan-old.png');
    expect(result.reconciled).toBe(true);

    expect(mockUploadsService.scheduleMediaDeletion).toHaveBeenCalledWith([
      '/uploads/orphan-old.png',
    ]);
  });

  it('should detect orphan files but NOT schedule deletion when dryRun is true', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);

    mockStorageProvider.listFiles!.mockResolvedValue([
      {
        url: '/uploads/orphan-dry.jpg',
        lastModified: twoDaysAgo,
        sizeBytes: 3000,
      },
    ]);

    const result = await service.detectAndReconcileOrphans({
      olderThanHours: 24,
      dryRun: true,
    });

    expect(result.orphanCount).toBe(1);
    expect(result.reconciled).toBe(false);
    expect(mockUploadsService.scheduleMediaDeletion).not.toHaveBeenCalled();
  });

  it('should handle cron execution without throwing errors', async () => {
    mockStorageProvider.listFiles!.mockResolvedValue([]);
    await expect(service.handleDailyReconciliation()).resolves.not.toThrow();
  });

  it('should catch and log error when reconciliation fails during cron', async () => {
    vi.spyOn(service, 'detectAndReconcileOrphans').mockRejectedValueOnce(
      new Error('Reconciliation error'),
    );
    await expect(service.handleDailyReconciliation()).resolves.not.toThrow();
  });
});
