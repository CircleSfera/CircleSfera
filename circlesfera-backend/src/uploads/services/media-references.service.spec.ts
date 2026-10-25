import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import {
  MEDIA_COLUMNS,
  MediaReferencesService,
} from './media-references.service.js';

const models = Prisma.dmmf.datamodel.models;
const delegateOf = (modelName: string) =>
  modelName.charAt(0).toLowerCase() + modelName.slice(1);

// String columns whose name says they hold an address, and that are not files
// of this server's storage, or that repeat another listed column.
const NOT_STORED_FILES = new Set([
  // Repeats the address of the post, message or comment, and is kept after it.
  'Media.url',
  'Media.standardUrl',
  'Media.thumbnailUrl',
  // The address of the reported page, given by the person who reports it.
  'IllegalContentNotice.contentUrl',
]);
const ADDRESS_NAME = /(url|Url|avatar|cover)$/;

// One fake delegate per model, answering the rows given for it.
function prismaWith(rows: Partial<Record<string, object[]>> = {}) {
  const prisma: Record<string, { findMany: ReturnType<typeof vi.fn> }> = {};
  for (const model of Object.keys(MEDIA_COLUMNS)) {
    prisma[model] = { findMany: vi.fn().mockResolvedValue(rows[model] ?? []) };
  }
  return prisma;
}

describe('MEDIA_COLUMNS', () => {
  it('names only models and columns that the schema has', () => {
    for (const [delegate, columns] of Object.entries(MEDIA_COLUMNS)) {
      const model = models.find((m) => delegateOf(m.name) === delegate);
      expect(model, delegate).toBeDefined();
      const fields = new Set(model?.fields.map((f) => f.name));
      for (const column of columns) {
        expect(fields.has(column), `${delegate}.${column}`).toBe(true);
      }
    }
  });

  it('lists every column of the schema that holds the address of a file', () => {
    const listed = new Set(
      Object.entries(MEDIA_COLUMNS).flatMap(([delegate, columns]) =>
        columns.map((c) => `${delegate}.${c}`),
      ),
    );
    const missing = models.flatMap((model) =>
      model.fields
        .filter(
          (f) =>
            f.kind === 'scalar' &&
            f.type === 'String' &&
            ADDRESS_NAME.test(f.name) &&
            !NOT_STORED_FILES.has(`${model.name}.${f.name}`) &&
            !listed.has(`${delegateOf(model.name)}.${f.name}`),
        )
        .map((f) => `${model.name}.${f.name}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('MediaReferencesService', () => {
  it('collects the addresses and file names of every listed column for the sweep', async () => {
    const prisma = prismaWith({
      comment: [{ voiceUrl: '/uploads/c.webm', url: null }],
      collection: [{ coverUrl: '/uploads/cover.jpg' }],
    });
    const service = new MediaReferencesService(
      prisma as unknown as PrismaService,
    );

    const keys = await service.referencedKeys();

    expect(keys).toEqual(
      new Set(['/uploads/c.webm', 'c.webm', '/uploads/cover.jpg', 'cover.jpg']),
    );
  });
});

describe('MediaReferencesService.inUse', () => {
  it('finds the stored files some row names by their exact key, in every listed column', async () => {
    const prisma = prismaWith({
      comment: [{ voiceUrl: '/uploads/a.m4a', url: '/uploads/not-asked.jpg' }],
      profile: [{ avatar: '/uploads/b.jpg' }],
    });
    const service = new MediaReferencesService(
      prisma as unknown as PrismaService,
    );

    const used = await service.inUse([
      '/uploads/a.m4a',
      '/uploads/b.jpg',
      '/uploads/free.jpg',
    ]);

    expect([...used].sort()).toEqual(['/uploads/a.m4a', '/uploads/b.jpg']);
    for (const [model, columns] of Object.entries(MEDIA_COLUMNS)) {
      const { where } = prisma[model].findMany.mock.calls.at(-1)?.[0] ?? {};
      for (const column of columns) {
        expect(where.OR).toContainEqual({
          [column]: {
            in: ['/uploads/a.m4a', '/uploads/b.jpg', '/uploads/free.jpg'],
          },
        });
      }
    }
  });

  it('asks nothing for no file', async () => {
    const prisma = prismaWith();
    const service = new MediaReferencesService(
      prisma as unknown as PrismaService,
    );
    await expect(service.inUse([])).resolves.toEqual(new Set());
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});
