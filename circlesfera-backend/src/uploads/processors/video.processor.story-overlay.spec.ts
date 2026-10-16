import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type Job, UnrecoverableError } from 'bullmq';
import sharp from 'sharp';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { LocalStorageProvider } from '../providers/local.provider.js';
import type { UploadsService } from '../uploads.service.js';
import { VideoProcessor } from './video.processor.js';

const job = (storyId?: string) =>
  ({ name: 'story-overlay', data: { storyId } }) as unknown as Job<{
    url: string;
    storyId?: string;
  }>;

function setup(story: unknown, written = 1) {
  const prisma = {
    story: {
      findUnique: vi.fn().mockResolvedValue(story),
      updateMany: vi.fn().mockResolvedValue({ count: written }),
    },
    media: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const storage = new LocalStorageProvider();
  const uploads = {
    ownsUrl: (url: string) => storage.ownsUrl(url),
    enqueueTranscode: vi.fn().mockResolvedValue(undefined),
  };
  const processor = new VideoProcessor(
    prisma as unknown as PrismaService,
    storage,
    uploads as unknown as UploadsService,
  );
  const { logger } = processor as unknown as {
    logger: { log: () => void };
  };
  vi.spyOn(logger, 'log').mockImplementation(() => {});
  return { prisma, storage, uploads, processor };
}

describe('VideoProcessor: the painted layer of a video story', () => {
  it('does nothing for a story that is gone or already joined', async () => {
    const { prisma, processor } = setup(null);
    await processor.process(job('s-1'));

    prisma.story.findUnique.mockResolvedValue({
      id: 's-1',
      url: `/uploads/${randomUUID()}.mp4`,
      overlayUrl: null,
      mediaId: null,
    });
    await processor.process(job('s-1'));

    expect(prisma.story.updateMany).not.toHaveBeenCalled();
  });

  it('never reads a video or a layer from outside its own storage', async () => {
    const { prisma, processor } = setup({
      id: 's-1',
      url: 'https://evil.example/video.mp4',
      overlayUrl: `/uploads/${randomUUID()}.png`,
      mediaId: null,
    });

    await expect(processor.process(job('s-1'))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    await expect(processor.process(job())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(prisma.story.updateMany).not.toHaveBeenCalled();
  });
});

// Real files through the real tools. Skipped where FFmpeg is not installed;
// the server image carries it.
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe.skipIf(!hasFfmpeg)(
  'a video story joined to its layer, for real',
  () => {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const made: string[] = [];
    let work: string;
    let videoUrl: string;
    let layerUrl: string;

    /** A wide blue video with sound, as a phone in landscape records it. */
    const makeVideo = () => {
      const name = `${randomUUID()}.mp4`;
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=640x360:d=2:r=10',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2',
        '-shortest',
        '-pix_fmt',
        'yuv420p',
        path.join(uploadsDir, name),
      ]);
      made.push(name);
      return `/uploads/${name}`;
    };

    /** A 9:16 layer, see-through but for a red block at its top left. */
    const makeLayer = async () => {
      const name = `${randomUUID()}.png`;
      const red = await sharp({
        create: {
          width: 195,
          height: 347,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      await sharp({
        create: {
          width: 390,
          height: 693,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([{ input: red, left: 0, top: 0 }])
        .png()
        .toFile(path.join(uploadsDir, name));
      made.push(name);
      return `/uploads/${name}`;
    };

    /** The colour of one point of the joined video, one second in. */
    const colourAt = async (file: string, x: number, y: number) => {
      const frame = path.join(work, `${randomUUID()}.png`);
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-ss',
        '1',
        '-i',
        file,
        '-frames:v',
        '1',
        frame,
      ]);
      const { data, info } = await sharp(frame)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const at = (y * info.width + x) * info.channels;
      return { r: data[at], g: data[at + 1], b: data[at + 2] };
    };

    const probe = (file: string) =>
      JSON.parse(
        execFileSync('ffprobe', [
          '-v',
          'error',
          '-show_streams',
          '-of',
          'json',
          file,
        ]).toString(),
      ) as {
        streams: { codec_type: string; width?: number; height?: number }[];
      };

    beforeAll(() => {
      fs.mkdirSync(uploadsDir, { recursive: true });
      work = fs.mkdtempSync(path.join(os.tmpdir(), 'story-overlay-spec-'));
    });

    beforeEach(async () => {
      videoUrl = makeVideo();
      layerUrl = await makeLayer();
    });

    afterAll(() => {
      for (const name of made) {
        fs.rmSync(path.join(uploadsDir, name), { force: true });
      }
      fs.rmSync(work, { recursive: true, force: true });
    });

    it('crops the video to 9:16, lays the layer over it, keeps the sound, and makes it the story’s', async () => {
      const { prisma, uploads, processor } = setup({
        id: 's-1',
        url: videoUrl,
        overlayUrl: layerUrl,
        mediaId: 'm-1',
      });

      await processor.process(job('s-1'));

      const data = prisma.story.updateMany.mock.calls[0][0].data as {
        url: string;
      };
      expect(prisma.story.updateMany).toHaveBeenCalledWith({
        where: { id: 's-1', url: videoUrl, overlayUrl: layerUrl },
        data: {
          url: expect.stringMatching(/^\/uploads\/[0-9a-f-]{36}\.mp4$/),
          overlayUrl: null,
          standardUrl: null,
          thumbnailUrl: null,
        },
      });
      made.push(path.basename(data.url));
      const joined = path.join(process.cwd(), data.url);

      const streams = probe(joined).streams;
      expect(streams.find((s) => s.codec_type === 'video')).toMatchObject({
        width: 720,
        height: 1280,
      });
      expect(streams.some((s) => s.codec_type === 'audio')).toBe(true);

      // The red block of the layer at the top left, the video's blue elsewhere.
      const top = await colourAt(joined, 90, 160);
      expect(top.r).toBeGreaterThan(200);
      expect(top.b).toBeLessThan(60);
      const bottom = await colourAt(joined, 540, 1000);
      expect(bottom.b).toBeGreaterThan(200);
      expect(bottom.r).toBeLessThan(60);

      expect(prisma.media.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { url: data.url, standardUrl: null, thumbnailUrl: null },
      });
      expect(uploads.enqueueTranscode).toHaveBeenCalledWith(data.url);
      // The first video and the layer are no longer kept.
      expect(fs.existsSync(path.join(process.cwd(), videoUrl))).toBe(false);
      expect(fs.existsSync(path.join(process.cwd(), layerUrl))).toBe(false);
    });

    it('keeps nothing when the story changed while it was being joined', async () => {
      const { uploads, processor } = setup(
        { id: 's-1', url: videoUrl, overlayUrl: layerUrl, mediaId: null },
        0,
      );
      const before = new Set(fs.readdirSync(uploadsDir));

      await processor.process(job('s-1'));

      const added = fs.readdirSync(uploadsDir).filter((f) => !before.has(f));
      expect(added).toEqual([]);
      expect(uploads.enqueueTranscode).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(process.cwd(), videoUrl))).toBe(true);
    });
  },
);
