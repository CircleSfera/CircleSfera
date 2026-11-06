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

describe('when each clip of an exported studio video plays', () => {
  it('puts each clip’s first frame where it starts on the timeline', async () => {
    await exportStudioProject(
      project(
        [
          track('v', [
            picture('first', { startAt: 0, duration: 3 }),
            picture('second', { startAt: 3, duration: 2 }),
          ]),
          track('layer', [picture('over', { startAt: 1.5, duration: 1 })]),
        ],
        5,
      ),
    );
    const graph = command[command.indexOf('-filter_complex') + 1];
    const chainOf = (input: number) =>
      graph.split(';').find((part) => part.startsWith(`[${input}:v]`)) ?? '';
    expect(chainOf(0)).not.toContain('setpts=PTS+');
    expect(chainOf(1)).toMatch(/,setpts=PTS\+3\/TB\[seg1\]$/);
    expect(chainOf(2)).toMatch(/,setpts=PTS\+1\.5\/TB\[seg2\]$/);
  });
});

describe('the size of what is placed in a smaller export', () => {
  it('shrinks moves and text with the video, as set in the editor', async () => {
    const words: Track = {
      id: 't',
      type: 'text',
      name: 't',
      muted: false,
      hidden: false,
      locked: false,
      clips: [
        {
          id: 'words',
          type: 'text',
          trackId: 't',
          startAt: 0,
          duration: 3,
          content: 'Hi',
          style: {
            fontFamily: 'Roboto',
            fontSize: 60,
            color: '#ffffff',
            backgroundColor: '#000000',
            padding: 12,
            textAlign: 'center',
            strokeColor: '#ff0000',
            strokeWidth: 4,
            shadowColor: '#000000',
          },
          transform: { scale: 1, rotation: 0, x: 40, y: 200 },
        },
      ],
    };
    await exportStudioProject(
      project(
        [
          track('v', [picture('base', { startAt: 0, duration: 3 })]),
          track('layer', [
            picture('over', {
              duration: 3,
              transform: { scale: 0.5, rotation: 0, x: 100, y: -300 },
            }),
          ]),
          words,
        ],
        3,
      ),
      { maxLongEdge: 960 },
    );
    const graph = command[command.indexOf('-filter_complex') + 1];
    // Half the editor's 1080 × 1920.
    expect(graph).toContain('overlay=x=(W-w)/2+50:y=(H-h)/2+-150');
    expect(graph).toContain(
      ':fontsize=30:fontcolor=0xffffff:x=(w-text_w)/2+20:y=(h-text_h)/2+100:box=1',
    );
    expect(graph).toContain(':boxborderw=6:');
    expect(graph).toContain(':borderw=2:');
    expect(graph).toContain(':shadowx=1:shadowy=1:');
  });
});
