import { HIDDEN_WORD_MAX_LENGTH, HIDDEN_WORDS_MAX } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HiddenWordsService } from './hidden-words.service.js';

const prisma = {
  $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
  $queryRaw: vi.fn().mockResolvedValue([]),
  hiddenWord: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
};

describe('HiddenWordsService', () => {
  let service: HiddenWordsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new HiddenWordsService(prisma as never);
  });

  it('lists the Profile its own words, newest first, with the most it can hide', async () => {
    const rows = [{ word: 'feo', createdAt: new Date() }];
    prisma.hiddenWord.findMany.mockResolvedValue(rows);

    await expect(service.list('p1')).resolves.toEqual({
      words: rows,
      max: HIDDEN_WORDS_MAX,
    });
    expect(prisma.hiddenWord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId: 'p1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('adds a word as it is matched, under the Profile lock', async () => {
    prisma.hiddenWord.findUnique.mockResolvedValue(null);
    prisma.hiddenWord.count.mockResolvedValue(0);

    await expect(service.add('p1', '  Pésimo ')).resolves.toEqual({
      word: 'pesimo',
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.hiddenWord.create).toHaveBeenCalledWith({
      data: { profileId: 'p1', word: 'pesimo' },
    });
  });

  it('adds a word already there only once', async () => {
    prisma.hiddenWord.findUnique.mockResolvedValue({ word: 'pesimo' });

    await expect(service.add('p1', 'pesimo')).resolves.toEqual({
      word: 'pesimo',
    });
    expect(prisma.hiddenWord.create).not.toHaveBeenCalled();
  });

  it('refuses a word past the most a Profile can hide', async () => {
    prisma.hiddenWord.findUnique.mockResolvedValue(null);
    prisma.hiddenWord.count.mockResolvedValue(HIDDEN_WORDS_MAX);

    await expect(service.add('p1', 'otra')).rejects.toMatchObject({
      response: { errorCode: 'HIDDEN_WORDS_FULL' },
    });
    expect(prisma.hiddenWord.create).not.toHaveBeenCalled();
  });

  it('refuses an empty word or one too long', async () => {
    for (const word of ['   ', 'x'.repeat(HIDDEN_WORD_MAX_LENGTH + 1)]) {
      await expect(service.add('p1', word)).rejects.toMatchObject({
        response: { errorCode: 'HIDDEN_WORD_INVALID' },
      });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('removes a word as it is matched', async () => {
    await expect(service.remove('p1', 'PÉSIMO')).resolves.toEqual({
      success: true,
    });
    expect(prisma.hiddenWord.deleteMany).toHaveBeenCalledWith({
      where: { profileId: 'p1', word: 'pesimo' },
    });
  });

  it('says whether a text contains one of the Profile words', async () => {
    prisma.hiddenWord.findMany.mockResolvedValue([{ word: 'pesimo' }]);

    await expect(service.hides('p1', 'Qué pésimo')).resolves.toBe(true);
    await expect(service.hides('p1', 'Qué bonito')).resolves.toBe(false);
    await expect(service.hides('p1', undefined)).resolves.toBe(false);
    expect(prisma.hiddenWord.findMany).toHaveBeenCalledTimes(2);
  });
});
