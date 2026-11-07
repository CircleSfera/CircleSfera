import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { StudioTemplatesService } from './studio-templates.service.js';

const access = vi.hoisted(() => ({ assertCanAccessPost: vi.fn() }));
vi.mock('../common/policies/post-access.policy.js', () => access);

const structure = {
  version: 1,
  aspectRatio: '9:16',
  slots: [{ duration: 2, speed: 1 }],
  effects: [],
};
const song = {
  audioId: 'song-1',
  url: 'https://cdn/library/song.mp3',
  mediaStart: 0,
  startAt: 0,
  duration: 2,
};

describe('StudioTemplatesService', () => {
  const prisma = {
    studioTemplate: {
      create: vi.fn(async ({ data }) => ({ id: 't-1', ...data })),
      upsert: vi.fn(async ({ create }) => ({ id: 't-2', ...create })),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(async ({ data }) => ({ id: 't-1', ...data, uses: 4 })),
      delete: vi.fn(),
    },
    studioTemplateUse: { create: vi.fn() },
    post: { findUnique: vi.fn() },
    audio: { findUnique: vi.fn() },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const service = new StudioTemplatesService(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    access.assertCanAccessPost.mockResolvedValue({});
  });

  describe('saving', () => {
    it('saves one of the Profile’s own, never offered without a Frame', async () => {
      await service.create('p-1', { name: 'Mine', structure, isPublic: true });
      expect(prisma.studioTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            profileId: 'p-1',
            name: 'Mine',
            isPublic: false,
          }),
        }),
      );
    });

    it('offers one from the Profile’s own Frame, replacing the Frame’s template', async () => {
      prisma.post.findUnique.mockResolvedValue({
        profileId: 'p-1',
        type: 'FRAME',
        deletedAt: null,
      });
      await service.create('p-1', {
        name: 'Mine',
        structure,
        postId: 'post-1',
        isPublic: true,
      });
      expect(prisma.studioTemplate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { postId: 'post-1' },
          create: expect.objectContaining({
            postId: 'post-1',
            isPublic: true,
            profileId: 'p-1',
          }),
          update: expect.objectContaining({ isPublic: true }),
        }),
      );
    });

    it('keeps one offered from a Frame off unless asked', async () => {
      prisma.post.findUnique.mockResolvedValue({
        profileId: 'p-1',
        type: 'FRAME',
        deletedAt: null,
      });
      await service.create('p-1', {
        name: 'Mine',
        structure,
        postId: 'post-1',
      });
      expect(
        prisma.studioTemplate.upsert.mock.calls[0][0].create.isPublic,
      ).toBe(false);
    });

    it.each([
      [
        'another Profile’s Frame',
        { profileId: 'p-2', type: 'FRAME', deletedAt: null },
        'Post not found',
      ],
      [
        'a deleted Frame',
        { profileId: 'p-1', type: 'FRAME', deletedAt: new Date() },
        'Post not found',
      ],
      ['no post', null, 'Post not found'],
      [
        'a post that is not a Frame',
        { profileId: 'p-1', type: 'POST', deletedAt: null },
        'offered from a Frame',
      ],
    ])('refuses to offer one from %s', async (_what, post, message) => {
      prisma.post.findUnique.mockResolvedValue(post);
      await expect(
        service.create('p-1', {
          name: 'N',
          structure,
          postId: 'post-1',
          isPublic: true,
        }),
      ).rejects.toThrow(message);
      expect(prisma.studioTemplate.upsert).not.toHaveBeenCalled();
    });

    it('refuses what is not a template', async () => {
      await expect(
        service.create('p-1', { name: 'N', structure: { version: 9 } }),
      ).rejects.toThrow('not a template');
    });

    it('passes on a failure that is not about the template', async () => {
      const broken = {
        version: 1,
        get slots(): unknown {
          throw new TypeError('boom');
        },
      };
      await expect(
        service.create('p-1', { name: 'N', structure: broken }),
      ).rejects.toThrow(TypeError);
    });

    it('keeps a library song at its own address, with the library’s title', async () => {
      prisma.audio.findUnique.mockResolvedValue({
        url: song.url,
        title: 'Sunrise',
      });
      await service.create('p-1', {
        name: 'N',
        structure: { ...structure, song },
      });
      const saved =
        prisma.studioTemplate.create.mock.calls[0][0].data.structure;
      expect(saved.song).toEqual({ ...song, title: 'Sunrise' });
    });

    it.each([
      ['a song not in the library', null],
      [
        'a song at another address',
        { url: 'https://cdn/someone.mp4', title: 'X' },
      ],
    ])('refuses %s', async (_what, found) => {
      prisma.audio.findUnique.mockResolvedValue(found);
      await expect(
        service.create('p-1', { name: 'N', structure: { ...structure, song } }),
      ).rejects.toThrow('song of the audio library');
    });
  });

  describe('the Profile’s own', () => {
    it('lists them, the latest first', async () => {
      await service.mine('p-1');
      expect(prisma.studioTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { profileId: 'p-1' },
          orderBy: { updatedAt: 'desc' },
        }),
      );
    });

    it('renames one and turns its offer on and off', async () => {
      prisma.studioTemplate.findFirst.mockResolvedValue({
        id: 't-1',
        postId: 'post-1',
      });
      await service.update('p-1', 't-1', { name: 'New', isPublic: false });
      expect(prisma.studioTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't-1' },
          data: { name: 'New', isPublic: false },
        }),
      );
      await service.update('p-1', 't-1', {});
      expect(prisma.studioTemplate.update.mock.calls[1][0].data).toEqual({});
    });

    it('offers only one that comes from a Frame', async () => {
      prisma.studioTemplate.findFirst.mockResolvedValue({
        id: 't-1',
        postId: null,
      });
      await expect(
        service.update('p-1', 't-1', { isPublic: true }),
      ).rejects.toThrow('from a Frame');
    });

    it('deletes one, and touches none of another Profile', async () => {
      prisma.studioTemplate.findFirst.mockResolvedValueOnce({
        id: 't-1',
        postId: null,
      });
      await service.remove('p-1', 't-1');
      expect(prisma.studioTemplate.delete).toHaveBeenCalledWith({
        where: { id: 't-1' },
      });
      prisma.studioTemplate.findFirst.mockResolvedValueOnce(null);
      await expect(service.remove('p-2', 't-1')).rejects.toThrow(
        'Template not found',
      );
      expect(prisma.studioTemplate.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: 't-1', profileId: 'p-2' } }),
      );
    });
  });

  describe('a Frame’s template', () => {
    const offered = {
      id: 't-1',
      name: 'Rhythm',
      structure,
      uses: 3,
      isPublic: true,
      profileId: 'author',
      profile: { username: 'maker' },
    };

    it('is shown to who can see the Frame, with its author', async () => {
      prisma.studioTemplate.findUnique.mockResolvedValue(offered);
      await expect(service.forPost('post-1', 'viewer')).resolves.toEqual({
        id: 't-1',
        name: 'Rhythm',
        structure,
        uses: 3,
        postId: 'post-1',
        author: { username: 'maker' },
      });
      expect(access.assertCanAccessPost).toHaveBeenCalledWith(
        prisma,
        'post-1',
        'viewer',
      );
    });

    it('is not shown when it is not offered, but its author sees it', async () => {
      prisma.studioTemplate.findUnique.mockResolvedValue({
        ...offered,
        isPublic: false,
      });
      await expect(service.forPost('post-1', 'viewer')).rejects.toThrow(
        'Template not found',
      );
      await expect(service.forPost('post-1', 'author')).resolves.toMatchObject({
        id: 't-1',
      });
      prisma.studioTemplate.findUnique.mockResolvedValue(null);
      await expect(service.forPost('post-1', null)).rejects.toThrow(
        'Template not found',
      );
    });

    it('follows the Frame’s rules: no template for who cannot see it', async () => {
      access.assertCanAccessPost.mockRejectedValue(
        new Error('This account is private'),
      );
      await expect(service.forPost('post-1', 'viewer')).rejects.toThrow(
        'This account is private',
      );
      expect(prisma.studioTemplate.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('using a template', () => {
    it('counts a Profile’s first use, and not the next', async () => {
      prisma.studioTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        profileId: 'author',
        postId: 'post-1',
        isPublic: true,
        uses: 4,
      });
      await expect(service.use('viewer', 't-1')).resolves.toEqual({ uses: 4 });
      expect(prisma.studioTemplateUse.create).toHaveBeenCalledWith({
        data: { templateId: 't-1', profileId: 'viewer' },
      });
      expect(prisma.studioTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { uses: { increment: 1 } } }),
      );
      prisma.studioTemplateUse.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(service.use('viewer', 't-1')).resolves.toEqual({ uses: 4 });
    });

    it('passes on any other failure', async () => {
      prisma.studioTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        profileId: 'viewer',
        postId: null,
        isPublic: false,
        uses: 0,
      });
      prisma.studioTemplateUse.create.mockRejectedValueOnce(
        new Error('db down'),
      );
      await expect(service.use('viewer', 't-1')).rejects.toThrow('db down');
    });

    it('is open to its author, and to who can see the Frame it is offered from', async () => {
      prisma.studioTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        profileId: 'p-1',
        postId: null,
        isPublic: false,
        uses: 0,
      });
      await expect(service.usable('p-1', 't-1')).resolves.toMatchObject({
        id: 't-1',
      });
      expect(access.assertCanAccessPost).not.toHaveBeenCalled();
      prisma.studioTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        profileId: 'author',
        postId: 'post-1',
        isPublic: true,
        uses: 0,
      });
      await service.usable('viewer', 't-1');
      expect(access.assertCanAccessPost).toHaveBeenCalledWith(
        prisma,
        'post-1',
        'viewer',
      );
    });

    it.each([
      ['a template that is not there', null],
      [
        'one not offered',
        {
          id: 't-1',
          profileId: 'author',
          postId: 'post-1',
          isPublic: false,
          uses: 0,
        },
      ],
      [
        'one offered from no Frame',
        {
          id: 't-1',
          profileId: 'author',
          postId: null,
          isPublic: true,
          uses: 0,
        },
      ],
    ])('is closed for %s', async (_what, template) => {
      prisma.studioTemplate.findUnique.mockResolvedValue(template);
      await expect(service.usable('viewer', 't-1')).rejects.toThrow(
        'Template not found',
      );
    });
  });
});
