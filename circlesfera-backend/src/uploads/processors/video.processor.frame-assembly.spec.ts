import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { LocalStorageProvider } from '../providers/local.provider.js';
import type { StoredFilesService } from '../services/stored-files.service.js';
import type {
  FrameAssemblyJobData,
  UploadsService,
} from '../uploads.service.js';
import { VideoProcessor } from './video.processor.js';

// Real files through the real tools. Skipped where FFmpeg is not installed;
// the server image carries it.
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

const job = (data: FrameAssemblyJobData) =>
  ({ name: 'frame-assembly', data }) as unknown as Job<{ url: string }>;

// A Frame lasts at least fifteen seconds: encoding one takes a few seconds,
// more while other tests run beside it.
const REAL_RUN_TIMEOUT_MS = 60_000;

describe.skipIf(!hasFfmpeg)(
  'a Frame put together from its clips, for real',
  { timeout: REAL_RUN_TIMEOUT_MS },
  () => {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const made: string[] = [];
    let work: string;

    /** A clip of one colour, with or without sound, of a given shape. */
    const makeClip = (colour: string, size: string, withSound: boolean) => {
      const name = `${randomUUID()}.mp4`;
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${colour}:s=${size}:d=10:r=10`,
        ...(withSound
          ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-shortest']
          : []),
        '-pix_fmt',
        'yuv420p',
        path.join(uploadsDir, name),
      ]);
      made.push(name);
      return `/uploads/${name}`;
    };

    /** A 9:16 layer, see-through but for a green block at its top left. */
    const makeLayer = async () => {
      const name = `${randomUUID()}.png`;
      const green = await sharp({
        create: {
          width: 195,
          height: 347,
          channels: 4,
          background: { r: 0, g: 255, b: 0, alpha: 1 },
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
        .composite([{ input: green, left: 0, top: 0 }])
        .png()
        .toFile(path.join(uploadsDir, name));
      made.push(name);
      return `/uploads/${name}`;
    };

    /** The colour of one point of a video at a moment. */
    const colourAt = async (
      file: string,
      atSec: number,
      x: number,
      y: number,
    ) => {
      const frame = path.join(work, `${randomUUID()}.png`);
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-ss',
        String(atSec),
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
          '-show_format',
          '-of',
          'json',
          file,
        ]).toString(),
      ) as {
        format: { duration: string };
        streams: { codec_type: string; width?: number; height?: number }[];
      };

    function setup() {
      const storage = new LocalStorageProvider();
      const uploads = {
        ownsUrl: (url: string) => storage.ownsUrl(url),
        enqueueTranscode: vi.fn().mockResolvedValue(undefined),
      };
      const storedFiles = { record: vi.fn().mockResolvedValue(undefined) };
      const processor = new VideoProcessor(
        {} as unknown as PrismaService,
        storage,
        uploads as unknown as UploadsService,
        storedFiles as unknown as StoredFilesService,
      );
      const { logger } = processor as unknown as {
        logger: { log: () => void };
      };
      vi.spyOn(logger, 'log').mockImplementation(() => {});
      return { uploads, storedFiles, processor };
    }

    beforeAll(() => {
      fs.mkdirSync(uploadsDir, { recursive: true });
      work = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-assembly-spec-'));
    });

    afterAll(() => {
      for (const name of made) {
        fs.rmSync(path.join(uploadsDir, name), { force: true });
      }
      fs.rmSync(work, { recursive: true, force: true });
    });

    it('plays the parts of the clips one after the other, 9:16, with the layer over them and the sound kept', async () => {
      const wide = makeClip('blue', '640x360', true);
      const tall = makeClip('red', '360x640', true);
      const layer = await makeLayer();
      const { uploads, storedFiles, processor } = setup();

      const result = await processor.process(
        job({
          profileId: 'p-1',
          clips: [
            { url: wide, startMs: 1000, endMs: 9000 },
            { url: tall, startMs: 2000, endMs: 10_000 },
          ],
          layerUrl: layer,
        }),
      );

      const url = (result as { url: string }).url;
      made.push(path.basename(url));
      const frame = path.join(process.cwd(), url);
      const read = probe(frame);
      expect(read.streams.find((s) => s.codec_type === 'video')).toMatchObject({
        width: 720,
        height: 1280,
      });
      expect(read.streams.some((s) => s.codec_type === 'audio')).toBe(true);
      // Eight seconds of each clip.
      expect(Number(read.format.duration)).toBeCloseTo(16, 0);

      // The first clip's blue, then the second's red, the layer over both.
      const first = await colourAt(frame, 4, 540, 1000);
      expect(first.b).toBeGreaterThan(200);
      expect(first.r).toBeLessThan(60);
      const second = await colourAt(frame, 12, 540, 1000);
      expect(second.r).toBeGreaterThan(200);
      expect(second.b).toBeLessThan(60);
      const layered = await colourAt(frame, 12, 90, 160);
      expect(layered.g).toBeGreaterThan(200);
      expect(layered.r).toBeLessThan(60);

      expect(storedFiles.record).toHaveBeenCalledWith([url], {
        profileId: 'p-1',
      });
      expect(uploads.enqueueTranscode).toHaveBeenCalledWith(url);
      // The clips and the layer are kept for the editor.
      for (const kept of [wide, tall, layer]) {
        expect(fs.existsSync(path.join(process.cwd(), kept))).toBe(true);
      }
    });

    it('keeps the sound when one of its clips has none, with silence for that one', async () => {
      const withSound = makeClip('blue', '640x360', true);
      const silent = makeClip('red', '640x360', false);
      const { processor } = setup();

      const result = await processor.process(
        job({
          profileId: 'p-1',
          clips: [
            { url: withSound, startMs: 0, endMs: 8000 },
            { url: silent, startMs: 0, endMs: 8000 },
          ],
        }),
      );

      const url = (result as { url: string }).url;
      made.push(path.basename(url));
      const read = probe(path.join(process.cwd(), url));
      expect(read.streams.map((s) => s.codec_type)).toEqual(['video', 'audio']);
      // The silence lasts as long as the silent clip: sound and picture end together.
      expect(Number(read.format.duration)).toBeCloseTo(16, 0);
    });
  },
);
