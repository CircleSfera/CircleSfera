import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageProvider } from '../interfaces/storage-provider.interface.js';
import type { UploadsService } from '../uploads.service.js';
import { MediaReconciliationService } from './media-reconciliation.service.js';
import {
  MEDIA_COLUMNS,
  MediaReferencesService,
} from './media-references.service.js';
import {
  ORPHAN_DELETIONS_PER_NIGHT,
  ORPHAN_GRACE_HOURS,
  ORPHAN_SHARE_WINDOW_DAYS,
} from './orphan-sweep.policy.js';
import type { StoredFilesService } from './stored-files.service.js';

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600 * 1000);
/** Older than the sweep's grace. */
const pastGrace = () => hoursAgo(ORPHAN_GRACE_HOURS + 24);

describe('MediaReconciliationService', () => {
  let service: MediaReconciliationService;
  let mockPrisma: any;
  let mockStoredFiles: {
    record: ReturnType<typeof vi.fn>;
    detachedSince: ReturnType<typeof vi.fn>;
    ownersOf: ReturnType<typeof vi.fn>;
  };
  let mockUploadsService: {
    scheduleMediaDeletion: ReturnType<typeof vi.fn>;
    ownsUrl: ReturnType<typeof vi.fn>;
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
    mockPrisma.$queryRaw = vi.fn().mockResolvedValue([]);

    mockStoredFiles = {
      record: vi.fn().mockResolvedValue(undefined),
      detachedSince: vi.fn().mockResolvedValue(new Set<string>()),
      ownersOf: vi.fn().mockResolvedValue(new Map<string, string>()),
    };
    mockUploadsService = {
      scheduleMediaDeletion: vi.fn().mockResolvedValue(undefined),
      // Every listed file is one this storage deletes, unless a test says.
      ownsUrl: vi.fn(() => true),
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
      mockStoredFiles as unknown as StoredFilesService,
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

  it('records with no owner the files on the disk past the grace period', async () => {
    const twoDaysAgo = pastGrace();
    mockStorageProvider.listFiles!.mockResolvedValue([
      { url: '/uploads/a.jpg', lastModified: twoDaysAgo, sizeBytes: 1 },
      { url: '/uploads/b.mp4', lastModified: twoDaysAgo, sizeBytes: 2 },
      // Still being written by an upload, which records it with its owner.
      { url: '/uploads/fresh.mp4', lastModified: new Date(), sizeBytes: 3 },
    ]);

    await service.detectAndReconcileOrphans({ dryRun: true });

    // Files already recorded keep their owner (record skips duplicates).
    expect(mockStoredFiles.record).toHaveBeenCalledWith(
      ['/uploads/a.jpg', '/uploads/b.mp4'],
      { profileId: null },
    );
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

  it('deletes at night with the grace and the cap of the sweep', async () => {
    const sweep = vi.spyOn(service, 'detectAndReconcileOrphans');

    await service.handleDailyReconciliation();

    expect(sweep).toHaveBeenCalledWith({ dryRun: false });
  });

  it('keeps a file used by no row for a week by default', async () => {
    mockPrisma.postMedia.findMany.mockResolvedValue([
      { url: '/uploads/used.jpg', standardUrl: null, thumbnailUrl: null },
    ]);
    mockStorageProvider.listFiles!.mockResolvedValue([
      { url: '/uploads/used.jpg', lastModified: pastGrace(), sizeBytes: 1 },
      { url: '/uploads/six-days.jpg', lastModified: hoursAgo(6 * 24) },
      { url: '/uploads/eight-days.jpg', lastModified: hoursAgo(8 * 24) },
      { url: '/uploads/used-too.jpg', lastModified: pastGrace() },
    ]);
    mockPrisma.postMedia.findMany.mockResolvedValue([
      { url: '/uploads/used.jpg', standardUrl: '/uploads/used-too.jpg' },
    ]);

    const result = await service.detectAndReconcileOrphans({ dryRun: false });

    expect(ORPHAN_GRACE_HOURS).toBe(7 * 24);
    expect(result.orphans.map((o) => o.url)).toEqual([
      '/uploads/eight-days.jpg',
    ]);
    expect(mockUploadsService.scheduleMediaDeletion).toHaveBeenCalledWith([
      '/uploads/eight-days.jpg',
    ]);
  });

  it('never deletes a file whose age the storage cannot tell', async () => {
    mockPrisma.postMedia.findMany.mockResolvedValue([
      { url: '/uploads/used.jpg', standardUrl: null, thumbnailUrl: null },
    ]);
    mockStorageProvider.listFiles!.mockResolvedValue([
      { url: '/uploads/used.jpg', lastModified: pastGrace() },
      { url: '/uploads/ageless.jpg' },
    ]);

    const result = await service.detectAndReconcileOrphans({ dryRun: false });

    expect(result.orphanCount).toBe(0);
    expect(mockUploadsService.scheduleMediaDeletion).not.toHaveBeenCalled();
  });

  it('deletes only so many a night, the oldest first', async () => {
    const used = Array.from({ length: 10 }, (_, i) => ({
      url: `/uploads/used-${i}.jpg`,
      standardUrl: null,
      thumbnailUrl: null,
    }));
    mockPrisma.postMedia.findMany.mockResolvedValue(used);
    mockStorageProvider.listFiles!.mockResolvedValue([
      ...used.map((m) => ({ url: m.url, lastModified: pastGrace() })),
      { url: '/uploads/old.jpg', lastModified: hoursAgo(400), sizeBytes: 3 },
      { url: '/uploads/older.jpg', lastModified: hoursAgo(500), sizeBytes: 4 },
      { url: '/uploads/newer.jpg', lastModified: hoursAgo(300), sizeBytes: 5 },
    ]);

    const result = await service.detectAndReconcileOrphans({
      dryRun: false,
      maxDeletions: 2,
    });

    expect(result.orphanCount).toBe(3);
    expect(result.deletedCount).toBe(2);
    expect(result.deletedBytes).toBe(7);
    expect(mockUploadsService.scheduleMediaDeletion).toHaveBeenCalledWith([
      '/uploads/older.jpg',
      '/uploads/old.jpg',
    ]);
  });

  it('caps a night at a few hundred files by default', () => {
    expect(ORPHAN_DELETIONS_PER_NIGHT).toBe(300);
  });

  it('deletes nothing when most of what was stored lately reads as unused', async () => {
    mockPrisma.postMedia.findMany.mockResolvedValue([
      { url: '/uploads/used.jpg', standardUrl: null, thumbnailUrl: null },
    ]);
    mockStorageProvider.listFiles!.mockResolvedValue([
      { url: '/uploads/used.jpg', lastModified: pastGrace() },
      { url: '/uploads/a.jpg', lastModified: pastGrace() },
      { url: '/uploads/b.jpg', lastModified: pastGrace() },
    ]);

    const result = await service.detectAndReconcileOrphans({ dryRun: false });

    expect(result.orphanCount).toBe(2);
    expect(result.heldBack).toContain(
      `2 of the 3 files of the last ${ORPHAN_SHARE_WINDOW_DAYS} days are unused`,
    );
    expect(result.deletedCount).toBe(0);
    expect(mockUploadsService.scheduleMediaDeletion).not.toHaveBeenCalled();
  });

  it('is not held back by files left over from long ago', async () => {
    const old = hoursAgo((ORPHAN_SHARE_WINDOW_DAYS + 10) * 24);
    mockPrisma.postMedia.findMany.mockResolvedValue([
      { url: '/uploads/used.jpg', standardUrl: null, thumbnailUrl: null },
    ]);
    mockStorageProvider.listFiles!.mockResolvedValue([
      // Lately: one file, used.
      { url: '/uploads/used.jpg', lastModified: pastGrace() },
      // Long ago: most of the disk, used by no row.
      { url: '/uploads/old-1.webp', lastModified: old, sizeBytes: 1 },
      { url: '/uploads/old-2.webp', lastModified: old, sizeBytes: 2 },
      { url: '/uploads/old-3.webp', lastModified: old, sizeBytes: 3 },
    ]);

    const result = await service.detectAndReconcileOrphans({ dryRun: false });

    expect(result.heldBack).toBeUndefined();
    expect(result.deletedCount).toBe(3);
    expect(mockUploadsService.scheduleMediaDeletion).toHaveBeenCalledWith([
      '/uploads/old-1.webp',
      '/uploads/old-2.webp',
      '/uploads/old-3.webp',
    ]);
  });

  it('weighs no share when nothing was stored lately', async () => {
    const old = hoursAgo((ORPHAN_SHARE_WINDOW_DAYS + 10) * 24);
    vi.spyOn(service, 'getReferencedMediaKeys').mockResolvedValue(
      new Set(['/uploads/something-else.jpg']),
    );
    mockStorageProvider.listFiles!.mockResolvedValue([
      { url: '/uploads/old.webp', lastModified: old },
    ]);

    const result = await service.detectAndReconcileOrphans({ dryRun: false });

    expect(result.heldBack).toBeUndefined();
    expect(result.deletedCount).toBe(1);
  });

  it('deletes nothing when no row reads as naming any file', async () => {
    mockStorageProvider.listFiles!.mockResolvedValue([
      { url: '/uploads/a.jpg', lastModified: pastGrace() },
    ]);
    const result = await service.detectAndReconcileOrphans({
      dryRun: false,
      // Even were the share allowed: no references is a misread.
      olderThanHours: 1,
    });

    expect(result.heldBack).toBe('no row names any file');
    expect(mockUploadsService.scheduleMediaDeletion).not.toHaveBeenCalled();
  });

  it('never weighs a file this storage does not delete: a stream in its folder, a file of another shape', async () => {
    mockUploadsService.ownsUrl.mockImplementation(
      (url: string) => !url.includes('/hls/') && !url.includes('legacy'),
    );
    mockPrisma.postMedia.findMany.mockResolvedValue([
      { url: '/uploads/used.jpg', standardUrl: null, thumbnailUrl: null },
    ]);
    mockStorageProvider.listFiles!.mockResolvedValue([
      { url: '/uploads/used.jpg', lastModified: pastGrace() },
      { url: '/uploads/orphan.jpg', lastModified: pastGrace() },
      // Were these weighed, they would be most of the disk and hold it back.
      { url: '/uploads/hls/x/seg1.ts', lastModified: pastGrace() },
      { url: '/uploads/hls/x/seg2.ts', lastModified: pastGrace() },
      { url: '/uploads/legacy-photo.jpg', lastModified: pastGrace() },
    ]);

    const result = await service.detectAndReconcileOrphans({ dryRun: false });

    expect(result.foreignCount).toBe(3);
    expect(result.orphans.map((o) => o.url)).toEqual(['/uploads/orphan.jpg']);
    expect(result.heldBack).toBeUndefined();
    expect(mockUploadsService.scheduleMediaDeletion).toHaveBeenCalledWith([
      '/uploads/orphan.jpg',
    ]);
  });

  it('keeps a video whose stream or cover in its folder a row still names', async () => {
    const used = ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg'];
    vi.spyOn(service, 'getReferencedMediaKeys').mockResolvedValue(
      new Set(used),
    );
    mockStorageProvider.listFiles!.mockResolvedValue(
      [...used, '/uploads/video.mp4'].map((url) => ({
        url,
        lastModified: pastGrace(),
      })),
    );
    // Asked of the candidates, a row names /uploads/video/master.m3u8.
    mockPrisma.postMedia.findMany.mockImplementation(
      async (args: { where?: unknown }) =>
        args.where
          ? [{ url: null, standardUrl: '/uploads/video/master.m3u8' }]
          : [],
    );

    const result = await service.detectAndReconcileOrphans({ dryRun: false });

    expect(result.orphanCount).toBe(1);
    expect(result.reconciled).toBe(false);
    expect(mockUploadsService.scheduleMediaDeletion).not.toHaveBeenCalled();
  });

  it('spares a file a row named while the sweep was running', async () => {
    const used = ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg'];
    vi.spyOn(service, 'getReferencedMediaKeys')
      .mockResolvedValueOnce(new Set(used))
      .mockResolvedValueOnce(new Set([...used, 'just-named.jpg']));
    mockStorageProvider.listFiles!.mockResolvedValue(
      [...used, '/uploads/just-named.jpg'].map((url) => ({
        url,
        lastModified: pastGrace(),
      })),
    );

    const result = await service.detectAndReconcileOrphans({ dryRun: false });

    expect(result.orphanCount).toBe(1);
    expect(result.reconciled).toBe(false);
    expect(mockUploadsService.scheduleMediaDeletion).not.toHaveBeenCalled();
  });

  it('logs each file it deletes with its owner and size, never its address', async () => {
    const log = vi.spyOn(
      (service as unknown as { logger: { log: (message: string) => void } })
        .logger,
      'log',
    );
    mockPrisma.postMedia.findMany.mockResolvedValue([
      { url: '/uploads/used.jpg', standardUrl: null, thumbnailUrl: null },
    ]);
    mockStorageProvider.listFiles!.mockResolvedValue([
      { url: '/uploads/used.jpg', lastModified: pastGrace() },
      { url: '/uploads/a/mine.jpg', lastModified: pastGrace(), sizeBytes: 42 },
      { url: '/uploads/a/nobodys.jpg', lastModified: pastGrace() },
      { url: '/uploads/used2.jpg', lastModified: pastGrace() },
    ]);
    mockPrisma.postMedia.findMany.mockResolvedValue([
      { url: '/uploads/used.jpg', standardUrl: '/uploads/used2.jpg' },
    ]);
    mockStoredFiles.ownersOf.mockResolvedValue(
      new Map([['/uploads/a/mine.jpg', 'profile-1']]),
    );

    await service.detectAndReconcileOrphans({ dryRun: false });

    const lines = log.mock.calls.map((call) => String(call[0]));
    expect(lines).toContain(
      `Orphan sweep deletes mine.jpg (owner: profile-1, 42 bytes, ${ORPHAN_GRACE_HOURS + 24} h old)`,
    );
    expect(
      lines.some((l) =>
        l.startsWith('Orphan sweep deletes nobodys.jpg (owner: none, 0 bytes'),
      ),
    ).toBe(true);
    expect(lines.some((l) => l.includes('/uploads/a/'))).toBe(false);
  });

  it('should catch and log error when reconciliation fails during cron', async () => {
    vi.spyOn(service, 'detectAndReconcileOrphans').mockRejectedValueOnce(
      new Error('Reconciliation error'),
    );
    await expect(service.handleDailyReconciliation()).resolves.not.toThrow();
  });

  it('survives a sweep that fails with something other than an error', async () => {
    vi.spyOn(service, 'detectAndReconcileOrphans').mockRejectedValueOnce(
      'disk gone',
    );
    await expect(service.handleDailyReconciliation()).resolves.not.toThrow();
  });

  it('counts as no orphan the file of content deleted less than 30 days ago', async () => {
    const old = pastGrace();
    mockStorageProvider.listFiles?.mockResolvedValue([
      { url: '/uploads/kept.jpg', lastModified: old },
      { url: '/uploads/orphan.jpg', lastModified: old },
    ]);
    mockStoredFiles.detachedSince.mockResolvedValue(
      new Set(['/uploads/kept.jpg']),
    );

    const result = await service.detectAndReconcileOrphans({ dryRun: true });

    expect(result.orphans.map((o) => o.url)).toEqual(['/uploads/orphan.jpg']);
    const cutoff = mockStoredFiles.detachedSince.mock.calls[0][0] as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(
      30 * 24 * 60 * 60 * 1000 - 1000,
    );
  });
});
