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
      storedFile: {
        count: vi.fn().mockResolvedValue(ownedCount),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
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
    // Attached again, a detached file is no longer private.
    expect(prisma.storedFile.updateMany).toHaveBeenCalledWith({
      where: {
        key: { in: ['/uploads/a.jpg', '/uploads/b.webp'] },
        detachedAt: { not: null },
      },
      data: { detachedAt: null },
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

  it("takes a file of a video's stream folder only from the video's owner", async () => {
    const V = '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d';
    const { prisma, files } = checker(0);

    await expect(
      files.assertOwnedBy('p-1', [`/uploads/${V}/master.m3u8`]),
    ).rejects.toMatchObject({ errorCode: FILE_NOT_OWNED, status: 400 });
    expect(prisma.storedFile.count).toHaveBeenCalledWith({
      where: {
        key: {
          in: ['mp4', 'mov', 'webm', 'm4v'].map((e) => `/uploads/${V}.${e}`),
        },
        profileId: { in: ['p-1'] },
      },
    });

    const owner = checker(1);
    await expect(
      owner.files.assertOwnedBy('p-1', [`/uploads/${V}/thumb.jpg`]),
    ).resolves.toBeUndefined();
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

describe('StoredFilesService.release', () => {
  it("marks every recorded file no row uses as detached, and answers only the author's own", async () => {
    const prisma = {
      storedFile: {
        findMany: vi.fn().mockResolvedValue([
          { key: '/uploads/own-free.jpg', profileId: 'author' },
          { key: '/uploads/own-still-used.jpg', profileId: 'author' },
          { key: '/uploads/theirs-free.jpg', profileId: 'other' },
          { key: '/uploads/ownerless-free.jpg', profileId: null },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
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

    const deletable = await files.release('author', [
      '/uploads/own-free.jpg',
      '/uploads/own-still-used.jpg',
      '/uploads/theirs-free.jpg',
      '/uploads/ownerless-free.jpg',
      null,
      '',
    ]);

    expect(deletable).toEqual(['/uploads/own-free.jpg']);
    // Unused files that stay are private from now on, until the sweep.
    expect(prisma.storedFile.updateMany).toHaveBeenCalledWith({
      where: {
        key: {
          in: [
            '/uploads/own-free.jpg',
            '/uploads/theirs-free.jpg',
            '/uploads/ownerless-free.jpg',
          ],
        },
        detachedAt: null,
      },
      data: { detachedAt: expect.any(Date) },
    });
  });

  it('asks nothing for content with no file, and marks nothing when every file is in use', async () => {
    const prisma = {
      storedFile: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ key: '/uploads/a.jpg', profileId: 'x' }]),
        updateMany: vi.fn(),
      },
    };
    const files = new StoredFilesService(
      prisma as unknown as PrismaService,
      {
        inUse: vi.fn().mockResolvedValue(new Set(['/uploads/a.jpg'])),
      } as never,
    );
    await expect(files.release('author', [null, undefined])).resolves.toEqual(
      [],
    );
    expect(prisma.storedFile.findMany).not.toHaveBeenCalled();

    await expect(files.release('x', ['/uploads/a.jpg'])).resolves.toEqual([]);
    expect(prisma.storedFile.updateMany).not.toHaveBeenCalled();
  });
});

describe('StoredFilesService.areReadableBy', () => {
  function reader(detached: Array<{ profileId: string | null }>) {
    const prisma = {
      storedFile: { findMany: vi.fn().mockResolvedValue(detached) },
    };
    return {
      prisma,
      files: new StoredFilesService(
        prisma as unknown as PrismaService,
        { inUse: vi.fn() } as never,
      ),
    };
  }

  it('lets anyone read files that are not detached, or not recorded', async () => {
    const { prisma, files } = reader([]);
    await expect(files.areReadableBy(['/uploads/a.jpg'], null)).resolves.toBe(
      true,
    );
    expect(prisma.storedFile.findMany).toHaveBeenCalledWith({
      where: { key: { in: ['/uploads/a.jpg'] }, detachedAt: { not: null } },
      select: { profileId: true },
    });
    await expect(files.areReadableBy([], null)).resolves.toBe(true);
  });

  it('lets only its owner read a detached file, and no one one with no owner', async () => {
    await expect(
      reader([{ profileId: 'p-1' }]).files.areReadableBy(
        ['/uploads/a.jpg'],
        'p-1',
      ),
    ).resolves.toBe(true);
    await expect(
      reader([{ profileId: 'p-1' }]).files.areReadableBy(
        ['/uploads/a.jpg'],
        'p-2',
      ),
    ).resolves.toBe(false);
    await expect(
      reader([{ profileId: 'p-1' }]).files.areReadableBy(
        ['/uploads/a.jpg'],
        null,
      ),
    ).resolves.toBe(false);
    await expect(
      reader([{ profileId: null }]).files.areReadableBy(
        ['/uploads/a.jpg'],
        'p-1',
      ),
    ).resolves.toBe(false);
  });
});

describe('StoredFilesService.ownersOf', () => {
  it('answers the recorded owner of each file that has one', async () => {
    const prisma = {
      storedFile: {
        findMany: vi.fn().mockResolvedValue([
          { key: '/uploads/a.jpg', profileId: 'p-1' },
          { key: '/uploads/b.jpg', profileId: null },
        ]),
      },
    };
    const files = new StoredFilesService(
      prisma as unknown as PrismaService,
      { inUse: vi.fn() } as never,
    );

    const owners = await files.ownersOf(['/uploads/a.jpg', '/uploads/b.jpg']);

    expect([...owners]).toEqual([['/uploads/a.jpg', 'p-1']]);
    await expect(files.ownersOf([])).resolves.toEqual(new Map());
  });
});
