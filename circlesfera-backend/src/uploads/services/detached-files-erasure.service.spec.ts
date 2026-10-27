import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DetachedFilesErasureService } from './detached-files-erasure.service.js';

describe('DetachedFilesErasureService', () => {
  const now = new Date('2026-11-30T03:00:00Z');
  const cutoff = new Date('2026-10-31T03:00:00Z');
  const claimed = {
    profileId: 'p-1',
    uploadedById: 'u-1',
    createdAt: new Date('2026-09-01'),
    detachedAt: new Date('2026-10-01'),
  };
  let storedFiles: {
    detachedBefore: ReturnType<typeof vi.fn>;
    reattach: ReturnType<typeof vi.fn>;
    claimExpired: ReturnType<typeof vi.fn>;
    restoreClaimed: ReturnType<typeof vi.fn>;
  };
  let references: { inUse: ReturnType<typeof vi.fn> };
  let storage: { delete: ReturnType<typeof vi.fn> };
  let service: DetachedFilesErasureService;

  beforeEach(() => {
    storedFiles = {
      detachedBefore: vi.fn().mockResolvedValue([]),
      reattach: vi.fn().mockResolvedValue(undefined),
      claimExpired: vi.fn().mockResolvedValue(claimed),
      restoreClaimed: vi.fn().mockResolvedValue(undefined),
    };
    references = { inUse: vi.fn().mockResolvedValue(new Set<string>()) };
    storage = { delete: vi.fn().mockResolvedValue(undefined) };
    service = new DetachedFilesErasureService(
      storedFiles as never,
      references as never,
      storage as never,
    );
  });

  it('deletes those no row uses, reattaches those a row uses again, page after page', async () => {
    storedFiles.detachedBefore
      .mockResolvedValueOnce(['/uploads/a.jpg', '/uploads/b.jpg'])
      .mockResolvedValueOnce(['/uploads/c.jpg'])
      .mockResolvedValueOnce([]);
    references.inUse.mockImplementation(
      async (keys: string[]) =>
        new Set(keys.filter((key) => key === '/uploads/b.jpg')),
    );

    await expect(service.eraseExpired(now)).resolves.toBe(2);

    expect(storedFiles.detachedBefore).toHaveBeenNthCalledWith(
      1,
      cutoff,
      null,
      500,
    );
    expect(storedFiles.detachedBefore).toHaveBeenNthCalledWith(
      2,
      cutoff,
      '/uploads/b.jpg',
      500,
    );
    expect(storedFiles.reattach).toHaveBeenCalledWith(['/uploads/b.jpg']);
    expect(storage.delete.mock.calls).toEqual([
      ['/uploads/a.jpg'],
      ['/uploads/c.jpg'],
    ]);
    // Each record is taken before its bytes go.
    expect(storedFiles.claimExpired).toHaveBeenCalledWith(
      '/uploads/a.jpg',
      cutoff,
    );
    expect(storedFiles.claimExpired.mock.invocationCallOrder[0]).toBeLessThan(
      storage.delete.mock.invocationCallOrder[0],
    );
  });

  it('leaves a file whose record was taken back meanwhile (attached again, or by another server)', async () => {
    storedFiles.detachedBefore
      .mockResolvedValueOnce(['/uploads/a.jpg'])
      .mockResolvedValueOnce([]);
    storedFiles.claimExpired.mockResolvedValueOnce(null);

    await expect(service.eraseExpired(now)).resolves.toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('keeps a file a row started to use after the page was read, with its record back', async () => {
    storedFiles.detachedBefore
      .mockResolvedValueOnce(['/uploads/a.jpg'])
      .mockResolvedValueOnce([]);
    references.inUse
      .mockResolvedValueOnce(new Set())
      .mockResolvedValueOnce(new Set(['/uploads/a.jpg']));

    await expect(service.eraseExpired(now)).resolves.toBe(0);
    expect(references.inUse).toHaveBeenLastCalledWith(['/uploads/a.jpg']);
    expect(storedFiles.restoreClaimed).toHaveBeenCalledWith(
      '/uploads/a.jpg',
      claimed,
    );
    expect(storedFiles.reattach).toHaveBeenLastCalledWith(['/uploads/a.jpg']);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('puts the record back when the bytes cannot be deleted, for the next night', async () => {
    storedFiles.detachedBefore
      .mockResolvedValueOnce(['/uploads/a.jpg', '/uploads/b.jpg'])
      .mockResolvedValueOnce([]);
    storage.delete.mockRejectedValueOnce(new Error('busy'));

    await expect(service.eraseExpired(now)).resolves.toBe(1);
    expect(storedFiles.restoreClaimed).toHaveBeenCalledWith(
      '/uploads/a.jpg',
      claimed,
    );
    expect(storage.delete).toHaveBeenCalledTimes(2);
  });

  it('stops without throwing when the record cannot be read, and answers what it erased so far', async () => {
    storedFiles.detachedBefore
      .mockResolvedValueOnce(['/uploads/a.jpg'])
      .mockRejectedValueOnce(new Error('db down'));

    await expect(service.eraseExpired(now)).resolves.toBe(1);
  });
});
