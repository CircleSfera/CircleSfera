import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageProvider } from '../interfaces/storage-provider.interface.js';
import type { UploadsService } from '../uploads.service.js';
import { MediaReconciliationService } from './media-reconciliation.service.js';
import {
  MEDIA_COLUMNS,
  MediaReferencesService,
} from './media-references.service.js';

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

    // Every model the reference list reads, with no rows unless a test says so.
    mockPrisma = Object.fromEntries(
      Object.keys(MEDIA_COLUMNS).map((model) => [
        model,
        { findMany: vi.fn().mockResolvedValue([]) },
      ]),
    );

    mockUploadsService = {
      scheduleMediaDeletion: vi.fn().mockResolvedValue(undefined),
    };

    mockStorageProvider = {
      upload: vi.fn(),
      delete: vi.fn(),
      listFiles: vi.fn().mockResolvedValue([]),
    };

    service = new MediaReconciliationService(
      new MediaReferencesService(mockPrisma as unknown as PrismaService),
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
        overlayUrl: '/uploads/story_layer.png',
      },
    ]);
    mockPrisma.message.findMany.mockResolvedValue([
      {
        url: '/uploads/chat_photo.jpg',
        standardUrl: null,
        thumbnailUrl: null,
        voiceUrl: '/uploads/voice.webm',
      },
    ]);
    mockPrisma.comment.findMany.mockResolvedValue([
      {
        url: null,
        standardUrl: null,
        thumbnailUrl: null,
        voiceUrl: '/uploads/reply.webm',
      },
    ]);
    mockPrisma.collection.findMany.mockResolvedValue([
      { coverUrl: '/uploads/saved.jpg', standardUrl: null, thumbnailUrl: null },
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
    // A layer still waiting to be joined is not an orphan.
    expect(keys.has('/uploads/story_layer.png')).toBe(true);
    // A chat photo, a voice note, a comment's voice and a collection's cover
    // are in use too: the sweep used to know none of them.
    expect(keys.has('/uploads/chat_photo.jpg')).toBe(true);
    expect(keys.has('/uploads/voice.webm')).toBe(true);
    expect(keys.has('/uploads/reply.webm')).toBe(true);
    expect(keys.has('/uploads/saved.jpg')).toBe(true);
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

  it('reports only at night: it deletes nothing, however many files no row uses', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
    mockStorageProvider.listFiles!.mockResolvedValue([
      { url: '/uploads/orphan.jpg', lastModified: twoDaysAgo, sizeBytes: 3000 },
    ]);
    const sweep = vi.spyOn(service, 'detectAndReconcileOrphans');

    await service.handleDailyReconciliation();

    expect(sweep).toHaveBeenCalledWith({ olderThanHours: 24, dryRun: true });
    expect(mockUploadsService.scheduleMediaDeletion).not.toHaveBeenCalled();
  });

  it('should catch and log error when reconciliation fails during cron', async () => {
    vi.spyOn(service, 'detectAndReconcileOrphans').mockRejectedValueOnce(
      new Error('Reconciliation error'),
    );
    await expect(service.handleDailyReconciliation()).resolves.not.toThrow();
  });
});
