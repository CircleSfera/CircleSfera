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
    // The content may still fail to save: a detached file stays private
    // until a row uses it.
    expect(prisma.storedFile.updateMany).not.toHaveBeenCalled();
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

describe('StoredFilesService.release, in a transaction', () => {
  it('reads and marks through the transaction that deletes the content', async () => {
    const prisma = { storedFile: { findMany: vi.fn(), updateMany: vi.fn() } };
    const tx = {
      storedFile: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ key: '/uploads/a.jpg', profileId: 'p-1' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const references = { inUse: vi.fn().mockResolvedValue(new Set()) };
    const files = new StoredFilesService(
      prisma as unknown as PrismaService,
      references as never,
    );

    await files.release('', ['/uploads/a.jpg'], tx as never);

    expect(references.inUse).toHaveBeenCalledWith(['/uploads/a.jpg'], tx);
    expect(tx.storedFile.updateMany).toHaveBeenCalled();
    expect(prisma.storedFile.findMany).not.toHaveBeenCalled();
    expect(prisma.storedFile.updateMany).not.toHaveBeenCalled();
  });
});

describe('StoredFilesService.erasableWith', () => {
  it("answers the author's own files no other row names, the rows being erased left out, and marks nothing", async () => {
    const prisma = {
      storedFile: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { key: '/uploads/own.jpg' },
            { key: '/uploads/own-shared.jpg' },
          ]),
        updateMany: vi.fn(),
      },
    };
    const references = {
      inUse: vi.fn().mockResolvedValue(new Set(['/uploads/own-shared.jpg'])),
    };
    const files = new StoredFilesService(
      prisma as unknown as PrismaService,
      references as never,
    );
    const ignoring = { postMedia: ['m-1'] };

    await expect(
      files.erasableWith(
        'author',
        [
          '/uploads/own.jpg',
          '/uploads/own-shared.jpg',
          '/uploads/own.jpg',
          null,
        ],
        ignoring,
      ),
    ).resolves.toEqual(['/uploads/own.jpg']);
    expect(prisma.storedFile.findMany).toHaveBeenCalledWith({
      where: {
        key: { in: ['/uploads/own.jpg', '/uploads/own-shared.jpg'] },
        profileId: 'author',
      },
      select: { key: true },
    });
    expect(references.inUse).toHaveBeenCalledWith(
      ['/uploads/own.jpg', '/uploads/own-shared.jpg'],
      undefined,
      ignoring,
    );
    expect(prisma.storedFile.updateMany).not.toHaveBeenCalled();

    await expect(files.erasableWith('author', [null, ''], {})).resolves.toEqual(
      [],
    );
    expect(prisma.storedFile.findMany).toHaveBeenCalledTimes(1);
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
  function reader(
    detached: Array<{ profileId: string | null; key?: string }>,
    used: string[] = [],
  ) {
    const prisma = {
      storedFile: {
        findMany: vi
          .fn()
          .mockResolvedValue(
            detached.map((file) => ({ key: '/uploads/a.jpg', ...file })),
          ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const references = { inUse: vi.fn().mockResolvedValue(new Set(used)) };
    return {
      prisma,
      references,
      files: new StoredFilesService(
        prisma as unknown as PrismaService,
        references as never,
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
      select: { key: true, profileId: true },
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

  it('opens a detached file again to everyone once a saved row uses it', async () => {
    const { prisma, references, files } = reader(
      [{ profileId: 'p-1' }],
      ['/uploads/a.jpg'],
    );

    await expect(files.areReadableBy(['/uploads/a.jpg'], 'p-2')).resolves.toBe(
      true,
    );
    // Only a shown row counts: not one in its author's Recently deleted.
    expect(references.inUse).toHaveBeenCalledWith(
      ['/uploads/a.jpg'],
      undefined,
      {},
      true,
    );
    expect(prisma.storedFile.updateMany).toHaveBeenCalledWith({
      where: { key: { in: ['/uploads/a.jpg'] }, detachedAt: { not: null } },
      data: { detachedAt: null },
    });
  });

  it('opens a video again when a row names its stream folder, and keeps closed a file no row uses', async () => {
    const V = '/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.mp4';
    const video = reader([{ profileId: 'p-1', key: V }], [V]);
    await expect(video.files.areReadableBy([V], null)).resolves.toBe(true);

    const unused = reader([{ profileId: 'p-1' }], []);
    await expect(
      unused.files.areReadableBy(['/uploads/a.jpg'], 'p-2'),
    ).resolves.toBe(false);
    expect(unused.prisma.storedFile.updateMany).not.toHaveBeenCalled();
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

describe('StoredFilesService, the files of deleted content', () => {
  function withPrisma(storedFile: Record<string, unknown>) {
    return new StoredFilesService(
      { storedFile } as unknown as PrismaService,
      { inUse: vi.fn() } as never,
    );
  }

  it('reads, a page at a time, the files with an owner detached before a time', async () => {
    const findMany = vi.fn().mockResolvedValue([{ key: '/uploads/b.jpg' }]);
    const cutoff = new Date('2026-10-31T03:00:00Z');

    await expect(
      withPrisma({ findMany }).detachedBefore(cutoff, '/uploads/a.jpg', 500),
    ).resolves.toEqual(['/uploads/b.jpg']);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        detachedAt: { lt: cutoff },
        profileId: { not: null },
        key: { gt: '/uploads/a.jpg' },
      },
      orderBy: { key: 'asc' },
      take: 500,
      select: { key: true },
    });

    await withPrisma({ findMany }).detachedBefore(cutoff, null, 10);
    expect(findMany.mock.calls[1][0].where).toEqual({
      detachedAt: { lt: cutoff },
      profileId: { not: null },
    });
  });

  it('reads the files still within their days, and reattaches files a row uses again', async () => {
    const findMany = vi.fn().mockResolvedValue([{ key: '/uploads/k.jpg' }]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const files = withPrisma({ findMany, updateMany });
    const cutoff = new Date('2026-10-31T03:00:00Z');

    await expect(files.detachedSince(cutoff)).resolves.toEqual(
      new Set(['/uploads/k.jpg']),
    );
    expect(findMany).toHaveBeenCalledWith({
      where: { detachedAt: { gte: cutoff } },
      select: { key: true },
    });

    await files.reattach([]);
    expect(updateMany).not.toHaveBeenCalled();
    await files.reattach(['/uploads/b.jpg']);
    expect(updateMany).toHaveBeenCalledWith({
      where: { key: { in: ['/uploads/b.jpg'] }, detachedAt: { not: null } },
      data: { detachedAt: null },
    });
  });
});

describe('StoredFilesService, taking an expired record', () => {
  const cutoff = new Date('2026-10-31T03:00:00Z');
  function files(row: unknown, taken = 1) {
    const storedFile = {
      findUnique: vi.fn().mockResolvedValue(row),
      deleteMany: vi.fn().mockResolvedValue({ count: taken }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    return {
      storedFile,
      service: new StoredFilesService(
        { storedFile } as unknown as PrismaService,
        { inUse: vi.fn() } as never,
      ),
    };
  }

  it('takes the record of a file with an owner detached before the cutoff', async () => {
    const detachedAt = new Date('2026-10-01T00:00:00Z');
    const record = {
      profileId: 'p-1',
      uploadedById: 'u-1',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      detachedAt,
    };
    const { storedFile, service } = files(record);

    // Whole, so that putting it back loses neither who uploaded it nor when.
    await expect(
      service.claimExpired('/uploads/a.jpg', cutoff),
    ).resolves.toEqual(record);
    expect(storedFile.deleteMany).toHaveBeenCalledWith({
      where: {
        key: '/uploads/a.jpg',
        detachedAt: { lt: cutoff },
        profileId: 'p-1',
      },
    });
  });

  it('takes nothing for a file attached again, within its days, with no owner, or taken by another server', async () => {
    for (const row of [
      null,
      { profileId: 'p-1', detachedAt: null },
      { profileId: 'p-1', detachedAt: new Date('2026-11-15T00:00:00Z') },
      { profileId: null, detachedAt: new Date('2026-10-01T00:00:00Z') },
    ]) {
      const { storedFile, service } = files(row);
      await expect(
        service.claimExpired('/uploads/a.jpg', cutoff),
      ).resolves.toBeNull();
      expect(storedFile.deleteMany).not.toHaveBeenCalled();
    }
    const raced = files(
      { profileId: 'p-1', detachedAt: new Date('2026-10-01T00:00:00Z') },
      0,
    );
    await expect(
      raced.service.claimExpired('/uploads/a.jpg', cutoff),
    ).resolves.toBeNull();
  });

  it('puts a taken record back as it was', async () => {
    const detachedAt = new Date('2026-10-01T00:00:00Z');
    const { storedFile, service } = files(null);

    const createdAt = new Date('2026-09-01T00:00:00Z');
    await service.restoreClaimed('/uploads/a.jpg', {
      profileId: 'p-1',
      uploadedById: 'u-1',
      createdAt,
      detachedAt,
    });

    expect(storedFile.createMany).toHaveBeenCalledWith({
      data: [
        {
          key: '/uploads/a.jpg',
          profileId: 'p-1',
          uploadedById: 'u-1',
          createdAt,
          detachedAt,
        },
      ],
      skipDuplicates: true,
    });
  });
});

describe('StoredFilesService, content in Recently deleted', () => {
  function detacher(owned: string[], used: string[] = []) {
    const tx = {
      storedFile: {
        findMany: vi.fn().mockResolvedValue(owned.map((key) => ({ key }))),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const references = { inUse: vi.fn().mockResolvedValue(new Set(used)) };
    const files = new StoredFilesService(
      { storedFile: { updateMany: vi.fn() } } as unknown as PrismaService,
      references as never,
    );
    return { tx, references, files };
  }

  it("marks the owner's files of a deleted post detached, in its transaction, but one another shown row still uses", async () => {
    const { tx, references, files } = detacher(
      ['/uploads/a.jpg', '/uploads/b.jpg'],
      ['/uploads/b.jpg'],
    );

    await files.detachDeleted(
      'p-1',
      ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/a.jpg', null, ''],
      tx as never,
    );

    // Only the owner's own, still attached.
    expect(tx.storedFile.findMany).toHaveBeenCalledWith({
      where: {
        key: { in: ['/uploads/a.jpg', '/uploads/b.jpg'] },
        profileId: 'p-1',
        detachedAt: null,
      },
      select: { key: true },
    });
    // The deleted row itself is no use: only shown rows count.
    expect(references.inUse).toHaveBeenCalledWith(
      ['/uploads/a.jpg', '/uploads/b.jpg'],
      tx,
      {},
      true,
    );
    expect(tx.storedFile.updateMany).toHaveBeenCalledWith({
      where: { key: { in: ['/uploads/a.jpg'] }, detachedAt: null },
      data: { detachedAt: expect.any(Date) },
    });
  });

  it("marks nothing when there is no file, none is the owner's, or every one is still used", async () => {
    const none = detacher([]);
    await none.files.detachDeleted('p-1', [null], none.tx as never);
    expect(none.tx.storedFile.findMany).not.toHaveBeenCalled();

    await none.files.detachDeleted('p-1', ['/uploads/x.jpg'], none.tx as never);
    expect(none.references.inUse).not.toHaveBeenCalled();
    expect(none.tx.storedFile.updateMany).not.toHaveBeenCalled();

    const used = detacher(['/uploads/a.jpg'], ['/uploads/a.jpg']);
    await used.files.detachDeleted('p-1', ['/uploads/a.jpg'], used.tx as never);
    expect(used.tx.storedFile.updateMany).not.toHaveBeenCalled();
  });

  it("opens the files of a restored post again in the restore's transaction", async () => {
    const { files } = detacher([]);
    const tx = { storedFile: { updateMany: vi.fn() } };

    await files.reattach(
      ['/uploads/a.jpg', null, '/uploads/a.jpg'],
      tx as never,
    );
    expect(tx.storedFile.updateMany).toHaveBeenCalledWith({
      where: { key: { in: ['/uploads/a.jpg'] }, detachedAt: { not: null } },
      data: { detachedAt: null },
    });

    await files.reattach([undefined, ''], tx as never);
    expect(tx.storedFile.updateMany).toHaveBeenCalledTimes(1);
  });
});
