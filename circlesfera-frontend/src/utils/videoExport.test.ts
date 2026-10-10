import { beforeEach, describe, expect, it, vi } from 'vitest';

const ff = vi.hoisted(() => ({
  load: vi.fn(),
  writeFile: vi.fn(),
  exec: vi.fn(),
  readFile: vi.fn(),
}));
const made = vi.hoisted(() => ({ count: 0 }));
vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: class {
    constructor() {
      made.count++;
      Object.assign(this, ff);
    }
  },
}));
vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(
    async (source: unknown) =>
      `bytes of ${typeof source === 'string' ? source : (source as File).name}`,
  ),
}));

import { exportEditedVideo } from './videoExport';

const clip = new File(['x'], 'holiday.clip.mov', { type: 'video/quicktime' });
const STYLE = 'filter-class:Custom__style:';
// The arguments the encoder was run with.
const args = () => ff.exec.mock.calls[0][0] as string[];
const argAfter = (flag: string) => args()[args().indexOf(flag) + 1];

describe('video export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ff.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it('loads the encoder once, from the files the app serves', async () => {
    // The encoder is kept once loaded: this case starts from a module that
    // has loaded none, whichever case ran before it.
    vi.resetModules();
    made.count = 0;
    const { initFFmpeg } = await import('./videoExport');
    const first = await initFFmpeg();
    const second = await initFFmpeg();

    expect(second).toBe(first);
    expect(made.count).toBe(1);
    expect(ff.load).toHaveBeenCalledTimes(1);
    expect(ff.load).toHaveBeenCalledWith({
      coreURL: '/ffmpeg/ffmpeg-core.js',
      wasmURL: '/ffmpeg/ffmpeg-core.wasm',
    });
  });

  it('gives back an MP4 named after the original, encoded with its sound', async () => {
    const out = await exportEditedVideo(clip, '');

    expect(out.name).toBe('edited_holiday.clip.mp4');
    expect(out.type).toBe('video/mp4');
    expect(ff.writeFile).toHaveBeenCalledWith(
      'input.mp4',
      'bytes of holiday.clip.mov',
    );
    expect(args()).toEqual([
      '-i',
      'input.mp4',
      '-c:a',
      'aac',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      'output.mp4',
    ]);
  });

  it('turns brightness, contrast and saturation into the values the encoder understands', async () => {
    await exportEditedVideo(
      clip,
      `${STYLE}brightness(120%) contrast(90%) saturate(150%)`,
    );

    expect(argAfter('-vf')).toBe(
      'eq=brightness=0.2:contrast=0.9:saturation=1.5',
    );
  });

  it('removes the colour when the filter is mostly grey', async () => {
    await exportEditedVideo(clip, `${STYLE}grayscale(80%)`);
    expect(argAfter('-vf')).toBe('eq=brightness=0:contrast=1:saturation=0');
  });

  it('adds temperature, vignette and grain when they are set, and nothing when they are neutral', async () => {
    await exportEditedVideo(clip, `${STYLE}__temp:130__vignette:40__noise:21`);
    expect(argAfter('-vf')).toBe(
      'colorbalance=rm=0.3:bm=-0.3,vignette=PI/4,noise=c0s=10:allf=t',
    );

    ff.exec.mockClear();
    await exportEditedVideo(clip, `${STYLE}__temp:100__vignette:0__noise:0`);
    expect(args()).not.toContain('-vf');
  });

  it('cuts the clip to the chosen start and end, placed before the input', async () => {
    await exportEditedVideo(clip, '', { startTime: 2, endTime: 9.5 } as never);

    expect(args().slice(0, 6)).toEqual([
      '-ss',
      '2',
      '-to',
      '9.5',
      '-i',
      'input.mp4',
    ]);
  });

  it('sets no end when none was chosen', async () => {
    await exportEditedVideo(clip, '', { startTime: 0, endTime: 0 } as never);

    expect(args().slice(0, 4)).toEqual(['-ss', '0', '-i', 'input.mp4']);
    expect(args()).not.toContain('-to');
  });

  it('drops the sound of a muted clip', async () => {
    await exportEditedVideo(clip, '', { muted: true } as never);

    expect(args()).toContain('-an');
    expect(args()).not.toContain('-c:a');
  });

  describe('with drawings and text over the video', () => {
    const overlay = 'data:image/png;base64,AAAA';

    it('lays them over the picture and keeps the sound', async () => {
      await exportEditedVideo(clip, '', undefined, overlay);

      expect(ff.writeFile).toHaveBeenCalledWith(
        'overlay.png',
        `bytes of ${overlay}`,
      );
      expect(argAfter('-filter_complex')).toBe('[0:v][1:v]overlay=0:0[outv]');
      expect(args()).toEqual(
        expect.arrayContaining(['-map', '[outv]', '0:a?']),
      );
    });

    it('applies the filter first and the overlay after', async () => {
      await exportEditedVideo(
        clip,
        `${STYLE}contrast(110%)`,
        undefined,
        overlay,
      );

      expect(argAfter('-filter_complex')).toBe(
        '[0:v]eq=brightness=0:contrast=1.1:saturation=1[bg];[bg][1:v]overlay=0:0[outv]',
      );
      expect(args()).not.toContain('-vf');
    });

    it('maps no sound for a muted clip', async () => {
      await exportEditedVideo(clip, '', { muted: true } as never, overlay);

      expect(args()).not.toContain('0:a?');
      expect(args()).toContain('-an');
    });
  });
});
