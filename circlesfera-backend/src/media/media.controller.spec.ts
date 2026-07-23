import * as fs from 'node:fs';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaController } from './media.controller.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

function createMockResponse(): Response {
  return {
    setHeader: vi.fn(),
    send: vi.fn(),
    sendFile: vi.fn(),
  } as unknown as Response;
}

function createMockRequest(): Request {
  return { ip: '127.0.0.1' } as unknown as Request;
}

describe('MediaController', () => {
  let controller: MediaController;

  const mockPrismaService = {
    postMedia: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    controller = module.get<MediaController>(MediaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('throws NotFoundException when the media record has no standardUrl', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue(null);

    await expect(
      controller.serveTeaser(
        'media-1',
        'master.m3u8',
        createMockRequest(),
        createMockResponse(),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when standardUrl has an unexpected format', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({
      standardUrl: 'https://cdn.example.com/not-a-local-path.mp4',
    });

    await expect(
      controller.serveTeaser(
        'media-1',
        'master.m3u8',
        createMockRequest(),
        createMockResponse(),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('blocks path traversal attempts outside the media folder', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({
      standardUrl: '/uploads/video_123/master.m3u8',
    });

    await expect(
      controller.serveTeaser(
        'media-1',
        ['..', '..', 'etc', 'passwd'],
        createMockRequest(),
        createMockResponse(),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when the resolved file does not exist on disk', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({
      standardUrl: '/uploads/video_123/master.m3u8',
    });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(
      controller.serveTeaser(
        'media-1',
        'master.m3u8',
        createMockRequest(),
        createMockResponse(),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('truncates an .m3u8 playlist to the first two segments and appends ENDLIST', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({
      standardUrl: '/uploads/video_123/master.m3u8',
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      [
        '#EXTM3U',
        '#EXTINF:2.0,',
        'stream_0.ts',
        '#EXTINF:2.0,',
        'stream_1.ts',
        '#EXTINF:2.0,',
        'stream_2.ts',
        '#EXT-X-ENDLIST',
      ].join('\n'),
    );

    const res = createMockResponse();
    await controller.serveTeaser(
      'media-1',
      'master.m3u8',
      createMockRequest(),
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.apple.mpegurl',
    );
    const sentBody = vi.mocked(res.send).mock.calls[0][0] as string;
    expect(sentBody).toContain('stream_0.ts');
    expect(sentBody).toContain('stream_1.ts');
    expect(sentBody).not.toContain('stream_2.ts');
    expect(sentBody.trim().endsWith('#EXT-X-ENDLIST')).toBe(true);
  });

  it('serves the first two .ts segments', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({
      standardUrl: '/uploads/video_123/master.m3u8',
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const res = createMockResponse();
    await controller.serveTeaser(
      'media-1',
      'stream_1.ts',
      createMockRequest(),
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'video/MP2T');
    expect(res.sendFile).toHaveBeenCalled();
  });

  it('locks .ts segments beyond the free preview window', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({
      standardUrl: '/uploads/video_123/master.m3u8',
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await expect(
      controller.serveTeaser(
        'media-1',
        'stream_2.ts',
        createMockRequest(),
        createMockResponse(),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('serves other file types (e.g. thumbnails) directly', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({
      standardUrl: '/uploads/video_123/master.m3u8',
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const res = createMockResponse();
    await controller.serveTeaser(
      'media-1',
      'thumb.jpg',
      createMockRequest(),
      res,
    );

    expect(res.sendFile).toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
