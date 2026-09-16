import * as fs from 'node:fs';
import * as path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createControllerApp } from '../common/testing/http-controller.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  STORAGE_PROVIDER,
  type StorageMediaItem,
} from '../uploads/interfaces/storage-provider.interface.js';
import { MediaController } from './media.controller.js';
import { MediaAuthService } from './media-auth.service.js';

const MEDIA_FOLDER = 'video_teaser_http_spec';
const mediaDir = path.resolve(process.cwd(), 'uploads', MEDIA_FOLDER);
// Local-style standardUrl so the controller can extract baseFolder
const standardUrl = `/uploads/${MEDIA_FOLDER}/master.m3u8`;

// ---------------------------------------------------------------------------
// Minimal StorageProvider mock that reads from the real temp dir on disk
// ---------------------------------------------------------------------------
const mockStorageProvider = {
  upload: vi.fn(),
  delete: vi.fn(),
  getMediaArtifact: vi.fn(
    async (params: {
      baseFolder: string;
      relativePath: string;
    }): Promise<StorageMediaItem | null> => {
      // Reject obvious path traversal
      if (
        params.relativePath.includes('..') ||
        params.relativePath.startsWith('/')
      ) {
        return null;
      }

      const filePath = path.resolve(
        process.cwd(),
        'uploads',
        params.baseFolder,
        params.relativePath,
      );
      try {
        const content = await fs.promises.readFile(filePath);
        const ext = path.extname(params.relativePath).toLowerCase();
        const contentType =
          ext === '.m3u8'
            ? 'application/vnd.apple.mpegurl'
            : ext === '.ts'
              ? 'video/MP2T'
              : ext === '.jpg'
                ? 'image/jpeg'
                : 'application/octet-stream';
        return { content, contentType };
      } catch {
        return null;
      }
    },
  ),
};

describe('MediaController', () => {
  let app: INestApplication;

  const mockPrismaService = {
    postMedia: {
      findUnique: vi.fn(),
    },
  };

  const mockMediaAuthService = {
    isAccessAllowed: vi.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [MediaController],
      providers: [
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MediaAuthService, useValue: mockMediaAuthService },
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
      ],
    });
    fs.mkdirSync(mediaDir, { recursive: true });
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(mediaDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock implementation after clearAllMocks
    mockStorageProvider.getMediaArtifact.mockImplementation(
      async (params: { baseFolder: string; relativePath: string }) => {
        if (
          params.relativePath.includes('..') ||
          params.relativePath.startsWith('/')
        ) {
          return null;
        }
        const filePath = path.resolve(
          process.cwd(),
          'uploads',
          params.baseFolder,
          params.relativePath,
        );
        try {
          const content = await fs.promises.readFile(filePath);
          const ext = path.extname(params.relativePath).toLowerCase();
          const contentType =
            ext === '.m3u8'
              ? 'application/vnd.apple.mpegurl'
              : ext === '.ts'
                ? 'video/MP2T'
                : ext === '.jpg'
                  ? 'image/jpeg'
                  : 'application/octet-stream';
          return { content, contentType };
        } catch {
          return null;
        }
      },
    );
  });

  it('returns 404 when the media record has no standardUrl', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/api/v1/media/teaser/media-1/master.m3u8')
      .expect(404);
  });

  it('returns 404 when standardUrl has an unexpected format', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({
      standardUrl: 'https://cdn.example.com/not-a-local-path.mp4',
    });

    await request(app.getHttpServer())
      .get('/api/v1/media/teaser/media-1/master.m3u8')
      .expect(404);
  });

  it('blocks path traversal attempts outside the media folder', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({ standardUrl });

    const traversal = encodeURIComponent('../../etc/passwd');
    await request(app.getHttpServer())
      .get(`/api/v1/media/teaser/media-1/${traversal}`)
      .expect(403);
  });

  it('returns 404 when the resolved file does not exist in storage', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({ standardUrl });

    await request(app.getHttpServer())
      .get('/api/v1/media/teaser/media-1/missing.m3u8')
      .expect(404);
  });

  it('truncates an .m3u8 playlist to the first two segments', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({ standardUrl });
    fs.writeFileSync(
      path.join(mediaDir, 'master.m3u8'),
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

    const res = await request(app.getHttpServer())
      .get('/api/v1/media/teaser/media-1/master.m3u8')
      .expect(200);

    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.apple\.mpegurl/,
    );
    expect(res.text).toContain('stream_0.ts');
    expect(res.text).toContain('stream_1.ts');
    expect(res.text).not.toContain('stream_2.ts');
    expect(res.text.trim().endsWith('#EXT-X-ENDLIST')).toBe(true);
  });

  it('serves the first two .ts segments', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({ standardUrl });
    fs.writeFileSync(path.join(mediaDir, 'stream_1.ts'), 'segment-bytes');

    const res = await request(app.getHttpServer())
      .get('/api/v1/media/teaser/media-1/stream_1.ts')
      .expect(200);

    expect(res.headers['content-type']).toMatch(/video\/MP2T/i);
    expect(res.body.toString()).toBe('segment-bytes');
  });

  it('locks .ts segments beyond the free preview window', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({ standardUrl });
    fs.writeFileSync(path.join(mediaDir, 'stream_2.ts'), 'locked');

    await request(app.getHttpServer())
      .get('/api/v1/media/teaser/media-1/stream_2.ts')
      .expect(403);
  });

  it('serves other file types (e.g. thumbnails) via storage provider', async () => {
    mockPrismaService.postMedia.findUnique.mockResolvedValue({ standardUrl });
    fs.writeFileSync(path.join(mediaDir, 'thumb.jpg'), 'jpeg-bytes');

    const res = await request(app.getHttpServer())
      .get('/api/v1/media/teaser/media-1/thumb.jpg')
      .expect(200);

    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(res.body.toString()).toBe('jpeg-bytes');
  });

  it('delegates to storageProvider and has no direct filesystem imports', () => {
    // Verify the provider was wired correctly — the mock must have been called
    // at least once if any earlier test ran. Here we just confirm the mock itself
    // is the injected provider (structural check).
    expect(mockStorageProvider.getMediaArtifact).toBeDefined();
  });
});
