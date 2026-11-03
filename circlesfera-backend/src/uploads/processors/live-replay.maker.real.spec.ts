import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composeArgs } from './live-replay.maker.js';

// The replay of a live with three guests, made by the real converter
// program. Skipped where the program is not installed; the server image
// carries it.
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe.skipIf(!hasFfmpeg)(
  'the replay of a live with guests, made for real',
  () => {
    let folder: string;
    // A person's recording: one colour, upright, with a tone.
    const recording = (name: string, colour: string, seconds: number) => {
      const file = path.join(folder, name);
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${colour}:s=720x1280:r=30:d=${seconds}`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=440:duration=${seconds}`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        file,
      ]);
      return file;
    };
    // The colour of one pixel of the replay at a moment, as red, green, blue.
    const pixel = (file: string, atSec: number, x: number, y: number) => {
      const raw = execFileSync('ffmpeg', [
        '-v',
        'error',
        '-ss',
        String(atSec),
        '-i',
        file,
        '-frames:v',
        '1',
        '-vf',
        `crop=2:2:${x}:${y}`,
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-',
      ]);
      return [raw[0], raw[1], raw[2]];
    };

    beforeAll(() => {
      folder = fs.mkdtempSync(path.join(os.tmpdir(), 'live-replay-real-'));
    });

    afterAll(() => {
      fs.rmSync(folder, { recursive: true, force: true });
    });

    it('keeps the host above and each guest in their own column below, upright 9:16', () => {
      const host = recording('host.mp4', 'white', 4);
      const out = path.join(folder, 'out');
      fs.mkdirSync(out);
      const playlist = path.join(out, 'master.m3u8');

      execFileSync('ffmpeg', [
        '-v',
        'error',
        ...composeArgs(
          { file: host, audio: true },
          [
            {
              file: recording('a.mp4', 'red', 4),
              audio: true,
              offsetMs: 0,
              column: 0,
            },
            {
              file: recording('b.mp4', 'lime', 3),
              audio: true,
              offsetMs: 500,
              column: 1,
            },
            {
              file: recording('c.mp4', 'blue', 2),
              audio: true,
              offsetMs: 1000,
              column: 2,
            },
          ],
          out,
          playlist,
        ),
      ]);

      const probe = JSON.parse(
        execFileSync('ffprobe', [
          '-v',
          'error',
          '-show_streams',
          '-show_format',
          '-of',
          'json',
          playlist,
        ]).toString(),
      ) as {
        format: { duration: string };
        streams: { codec_type: string; width?: number; height?: number }[];
      };
      const video = probe.streams.find((s) => s.codec_type === 'video');
      expect([video?.width, video?.height]).toEqual([720, 1280]);
      expect(probe.streams.some((s) => s.codec_type === 'audio')).toBe(true);
      // As long as the host's recording.
      expect(Number(probe.format.duration)).toBeGreaterThan(3.5);
      expect(Number(probe.format.duration)).toBeLessThan(4.5);

      // At 1.5 s everyone is on: white above; red, green, blue below.
      const strong = (rgb: number[], channel: number) =>
        rgb[channel] > 150 &&
        rgb.every((value, other) => other === channel || value < 110);
      expect(pixel(playlist, 1.5, 360, 320).every((v) => v > 200)).toBe(true);
      expect(strong(pixel(playlist, 1.5, 120, 960), 0)).toBe(true);
      expect(strong(pixel(playlist, 1.5, 360, 960), 1)).toBe(true);
      expect(strong(pixel(playlist, 1.5, 600, 960), 2)).toBe(true);
      // At 0.2 s only the first guest had joined: the third column is black.
      expect(pixel(playlist, 0.2, 600, 960).every((v) => v < 40)).toBe(true);
    });
  },
);
