import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaClip, StudioProject, Track } from '../types/studio';

/** The command the encoder was last run with. */
let command: string[];

vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: class {
    on() {}
    terminate = vi.fn();
    load = vi.fn(async () => {});
    writeFile = vi.fn(async () => {});
    deleteFile = vi.fn(async () => {});
    exec = vi.fn(async (args: string[]) => {
      command = args;
      return 0;
    });
    readFile = vi.fn(async () => new Uint8Array([1, 2, 3]));
  },
}));
vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(async () => new Uint8Array([0])),
  toBlobURL: vi.fn(async () => 'blob:mock'),
}));

import { exportStudioProject } from './ffmpegExport';

const picture = (id: string, over: Partial<MediaClip> = {}): MediaClip => ({
  id,
  trackId: 'v',
  type: 'image',
  file: null,
  fileUrl: `https://cdn.example.com/${id}.png`,
  startAt: 0,
  duration: 3,
  mediaStart: 0,
  speed: 1,
  volume: 1,
  muted: true,
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
  ...over,
});

const track = (
  id: string,
  clips: MediaClip[],
  over: Partial<Track> = {},
): Track => ({
  id,
  type: 'video',
  name: id,
  clips,
  muted: false,
  hidden: false,
  locked: false,
  ...over,
});

const project = (tracks: Track[], duration: number): StudioProject => ({
  id: 'p',
  name: 'Edit',
  duration,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  tracks,
  createdAt: '',
  updatedAt: '',
});

/** How long the exported video is told to be, and how long its black base. */
const lengths = () => ({
  video: command[command.indexOf('-t', command.indexOf('-filter_complex')) + 1],
  base: /color=c=black:[^[]*:d=([\d.]+):/.exec(
    command[command.indexOf('-filter_complex') + 1],
  )?.[1],
});

describe('how long an exported studio video is', () => {
  beforeEach(() => {
    command = [];
  });

  it('ends with its last clip, not with the length the timeline keeps', async () => {
    // A new project keeps ten seconds; its only picture lasts three.
    await exportStudioProject(project([track('v', [picture('a')])], 10));

    expect(lengths()).toEqual({ video: '3', base: '3' });
  });

  it('reaches a clip that ends after the length the project kept', async () => {
    await exportStudioProject(
      project([track('v', [picture('a', { startAt: 9, duration: 6 })])], 10),
    );

    expect(lengths()).toEqual({ video: '15', base: '15' });
  });

  it('does not count a clip on a hidden track', async () => {
    await exportStudioProject(
      project(
        [
          track('v', [picture('a')]),
          track('hidden', [picture('b', { duration: 40 })], { hidden: true }),
        ],
        40,
      ),
    );

    expect(lengths().video).toBe('3');
  });

  it('is never under a second', async () => {
    await exportStudioProject(
      project([track('v', [picture('a', { duration: 0.4 })])], 10),
    );

    expect(lengths().video).toBe('1');
  });
});
