import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { FILE_NOT_OWNED, StoredFilesService } from './stored-files.service.js';

function service() {
  const prisma = { storedFile: { createMany: vi.fn().mockResolvedValue({}) } };
  return {
    prisma,
    files: new StoredFilesService(
      prisma as unknown as PrismaService,
      { inUse: async () => new Set<string>() } as never,
    ),
  };
}

describe('StoredFilesService', () => {
  it('records each file once, keeping the first owner of a file already recorded', async () => {
    const { prisma, files } = service();

    await files.record(
      ['/uploads/a.jpg', '/uploads/a.jpg', '/uploads/b.webp'],
      {
        profileId: 'p-1',
        uploadedById: 'u-1',
      },
    );

    expect(prisma.storedFile.createMany).toHaveBeenCalledWith({
      data: [
        { key: '/uploads/a.jpg', profileId: 'p-1', uploadedById: 'u-1' },
        { key: '/uploads/b.webp', profileId: 'p-1', uploadedById: 'u-1' },
      ],
      skipDuplicates: true,
    });
  });

  it('writes nothing when there is no file, and inside the transaction it is given', async () => {
    const { prisma, files } = service();
    await files.record([''], { profileId: 'p-1' });
    expect(prisma.storedFile.createMany).not.toHaveBeenCalled();

    const tx = { storedFile: { createMany: vi.fn().mockResolvedValue({}) } };
    await files.record(['/uploads/c.mp4'], { profileId: 'p-2' }, tx as never);
    expect(tx.storedFile.createMany).toHaveBeenCalledWith({
      data: [{ key: '/uploads/c.mp4', profileId: 'p-2', uploadedById: null }],
      skipDuplicates: true,
    });
    expect(prisma.storedFile.createMany).not.toHaveBeenCalled();
  });
});

describe('StoredFilesService.assertOwnedBy', () => {
  const ownStorage = {
    ownsUrl: (url: string) => url.startsWith('/uploads/'),
  };
  function checker(
    ownedCount: number,
    storage: object | undefined = ownStorage,
  ) {
    const prisma = {
      storedFile: { count: vi.fn().mockResolvedValue(ownedCount) },
    };
    return {
      prisma,
      files: new StoredFilesService(
        prisma as unknown as PrismaService,
        { inUse: async () => new Set<string>() } as never,
        storage as never,
      ),
    };
  }

  it('lets a Profile attach the stored files that are its own', async () => {
    const { prisma, files } = checker(2);

    await expect(
      files.assertOwnedBy('p-1', ['/uploads/a.jpg', '/uploads/b.webp', null]),
    ).resolves.toBeUndefined();
    expect(prisma.storedFile.count).toHaveBeenCalledWith({
      where: {
        key: { in: ['/uploads/a.jpg', '/uploads/b.webp'] },
        profileId: { in: ['p-1'] },
      },
    });
  });

  it('refuses a stored file of another Profile, or one with no owner', async () => {
    const { files } = checker(1);

    await expect(
      files.assertOwnedBy('p-1', ['/uploads/mine.jpg', '/uploads/theirs.jpg']),
    ).rejects.toMatchObject({ errorCode: FILE_NOT_OWNED, status: 400 });
  });

  it('leaves addresses of other storages alone, and asks nothing when none is its own', async () => {
    const { prisma, files } = checker(0);

    await files.assertOwnedBy('p-1', [
      'https://cdn.example/x.jpg',
      '',
      undefined,
    ]);

    expect(prisma.storedFile.count).not.toHaveBeenCalled();
  });

  it('checks every address when the storage cannot tell its own', async () => {
    const { prisma, files } = checker(0, {});

    await expect(
      files.assertOwnedBy(['p-1', 'p-2'], ['https://anything/x.jpg']),
    ).rejects.toMatchObject({ errorCode: FILE_NOT_OWNED, status: 400 });
    expect(prisma.storedFile.count).toHaveBeenCalledWith({
      where: {
        key: { in: ['https://anything/x.jpg'] },
        profileId: { in: ['p-1', 'p-2'] },
      },
    });
  });
});

describe('StoredFilesService.deletableBy', () => {
  it("names only the author's own files that no other row still uses", async () => {
    const prisma = {
      storedFile: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { key: '/uploads/own-free.jpg' },
            { key: '/uploads/own-still-used.jpg' },
          ]),
      },
    };
    const references = {
      inUse: vi
        .fn()
        .mockResolvedValue(new Set(['/uploads/own-still-used.jpg'])),
    };
    const files = new StoredFilesService(
      prisma as unknown as PrismaService,
      references as never,
    );

    const deletable = await files.deletableBy('author', [
      '/uploads/own-free.jpg',
      '/uploads/own-still-used.jpg',
      '/uploads/someone-elses.jpg',
      null,
      '',
    ]);

    expect(deletable).toEqual(['/uploads/own-free.jpg']);
    // Another Profile's file, or one with no owner, is not even considered.
    expect(prisma.storedFile.findMany).toHaveBeenCalledWith({
      where: {
        key: {
          in: [
            '/uploads/own-free.jpg',
            '/uploads/own-still-used.jpg',
            '/uploads/someone-elses.jpg',
          ],
        },
        profileId: 'author',
      },
      select: { key: true },
    });
    expect(references.inUse).toHaveBeenCalledWith([
      '/uploads/own-free.jpg',
      '/uploads/own-still-used.jpg',
    ]);
  });

  it('asks nothing for content with no file', async () => {
    const prisma = { storedFile: { findMany: vi.fn() } };
    const files = new StoredFilesService(
      prisma as unknown as PrismaService,
      { inUse: vi.fn() } as never,
    );
    await expect(
      files.deletableBy('author', [null, undefined]),
    ).resolves.toEqual([]);
    expect(prisma.storedFile.findMany).not.toHaveBeenCalled();
  });
});
