import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OldDeletedMessagesService } from './old-deleted-messages.service.js';

describe('OldDeletedMessagesService', () => {
  const tx = { message: { update: vi.fn() } };
  const prisma = {
    message: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const uploads = { releaseContentFiles: vi.fn() };
  const service = new OldDeletedMessagesService(
    prisma as never,
    uploads as never,
  );
  const old = (id: string) => ({
    id,
    url: `/uploads/${id}.jpg`,
    standardUrl: null,
    thumbnailUrl: `/uploads/${id}_t.jpg`,
    voiceUrl: null,
    media: { url: `/uploads/${id}.jpg`, standardUrl: null, thumbnailUrl: null },
    voiceMedia: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  });

  it('settles each old deleted message as one deleted today: addresses cleared, files released', async () => {
    prisma.message.findMany.mockResolvedValueOnce([old('m1')]);

    const settled = await service.settle();

    expect(settled).toBe(1);
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: true }),
        take: 100,
      }),
    );
    expect(tx.message.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: expect.objectContaining({
        url: null,
        thumbnailUrl: null,
        mediaId: null,
        voiceUrl: null,
        voiceMediaId: null,
      }),
    });
    expect(uploads.releaseContentFiles).toHaveBeenCalledWith(
      [
        '/uploads/m1.jpg',
        null,
        '/uploads/m1_t.jpg',
        null,
        '/uploads/m1.jpg',
        null,
        null,
        undefined,
      ],
      tx,
    );
  });

  it('does nothing once every old message is settled', async () => {
    prisma.message.findMany.mockResolvedValueOnce([]);

    expect(await service.settle()).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('goes on past a message it cannot settle, and does not read it again tonight', async () => {
    prisma.message.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, i) => old(`m${i}`)),
      )
      .mockResolvedValueOnce([old('n1')]);
    prisma.$transaction
      .mockImplementationOnce(async () => {
        throw new Error('db');
      })
      .mockImplementation(async (fn) => fn(tx));

    const settled = await service.settle();

    expect(settled).toBe(100);
    expect(prisma.message.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { notIn: ['m0'] } }),
      }),
    );
  });

  it('stops after its pages for the night', async () => {
    prisma.message.findMany.mockImplementation(async () =>
      Array.from({ length: 100 }, (_, i) => old(`m${i}`)),
    );

    const settled = await service.settle();

    expect(prisma.message.findMany).toHaveBeenCalledTimes(20);
    expect(settled).toBe(2000);
  });
});
