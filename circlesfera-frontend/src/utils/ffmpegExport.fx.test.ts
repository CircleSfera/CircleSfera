import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  effectClip,
  mediaClip,
  studioProject,
  studioTrack,
} from '../test/studio-fixtures';
import type { StudioProject } from '../types/studio';

/** The command the encoder was last run with, and the files written. */
let command: string[];
let written: string[];

vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: class {
    on() {}
    terminate = vi.fn();
    load = vi.fn(async () => {});
    writeFile = vi.fn(async (name: string) => {
      written.push(name);
    });
    exec = vi.fn(async (args: string[]) => {
      command = args;
      return 0;
    });
    readFile = vi.fn(async () => new Uint8Array([1]));
  },
}));
vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(async () => new Uint8Array([0])),
  toBlobURL: vi.fn(async () => 'blob:mock'),
}));
vi.mock('./studioCanvasFx', () => ({
  vignetteMaskPng: vi.fn(async () => new Uint8Array([9])),
}));

import { exportStudioProject } from './ffmpegExport';
import { vignetteMaskPng } from './studioCanvasFx';
import { packMainTrack } from './studioTimeline';

const graph = () => command[command.indexOf('-filter_complex') + 1];
const exported = (project: StudioProject) =>
  exportStudioProject(packMainTrack(project), { maxLongEdge: 1920 });

describe('exporting transitions, effects and adjustments', () => {
  beforeEach(() => {
    written = [];
    vi.clearAllMocks();
  });

  const withCuts = () =>
    studioProject([
      studioTrack('v1', 'video', [
        mediaClip('a', {
          startAt: 0,
          duration: 4,
          transitionOut: { kind: 'slideleft', duration: 0.5 },
        }),
        mediaClip('b', { startAt: 4, duration: 3, type: 'image', muted: true }),
        mediaClip('c', { startAt: 7, duration: 4 }),
      ]),
      studioTrack('v2', 'video', [
        mediaClip('over', { trackId: 'v2', startAt: 1, duration: 2 }),
      ]),
    ]);

  it('joins the main clips through their transitions, then lays the layers over them', async () => {
    await exported(withCuts());
    const g = graph();
    // Each main clip laid on black the size of the video, as long as it.
    expect(g).toContain(
      'color=c=black:s=1080x1920:r=30:d=4[bg0];[bg0][seg0]overlay=x=(W-w)/2+0:y=(H-h)/2+0:shortest=1,format=yuv420p,setsar=1,fps=30,settb=AVTB[m0]',
    );
    expect(g).toContain(
      '[m0][m1]xfade=transition=slideleft:duration=0.5:offset=3.5[j0]',
    );
    expect(g).toContain('[j0][m2]concat=n=2:v=1:a=0[j1]');
    expect(g).toContain('[basev][j1]overlay=eof_action=pass[mainv]');
    expect(g).toContain('[mainv][seg3]overlay=');
    // The main clips are not laid over the base one by one.
    expect(g).not.toContain('[basev][seg0]');
  });

  it('fades the sound of the clips on either side of a transition over its length', async () => {
    await exported(withCuts());
    const g = graph();
    expect(g).toContain(
      '[0:a]atrim=start=0:duration=4,asetpts=PTS-STARTPTS,afade=t=out:st=3.5:d=0.5,adelay=0|0',
    );
    expect(g).toMatch(
      /\[2:a\]atrim=start=0:duration=4,asetpts=PTS-STARTPTS,adelay=6500\|6500/,
    );
  });

  it('lays the main clips over the base as before when there is no transition', async () => {
    await exported(
      studioProject([
        studioTrack('v1', 'video', [
          mediaClip('a', { startAt: 0, duration: 4 }),
          mediaClip('b', { startAt: 4, duration: 4 }),
        ]),
      ]),
    );
    expect(graph()).toContain('[basev][seg0]overlay=');
    expect(graph()).not.toContain('xfade');
  });

  it('applies each effect over its stretch, before the texts, with a vignette from its mask', async () => {
    const project = studioProject([
      studioTrack('v1', 'video', [mediaClip('a', { startAt: 0, duration: 6 })]),
      studioTrack('fx1', 'effect', [
        effectClip('vig', {
          effect: 'vignette',
          startAt: 1,
          duration: 2,
          intensity: 100,
        }),
        effectClip('sh', { effect: 'shake', startAt: 3, duration: 2 }),
      ]),
    ]);
    await exported(project);
    expect(vignetteMaskPng).toHaveBeenCalledWith(1080, 1920, 0.85);
    expect(written).toContain('fx_mask_1.png');
    expect(command.join(' ')).toContain('-loop 1 -t 6 -i fx_mask_1.png');
    const g = graph();
    expect(g).toContain(
      '[fx0b]trim=start=1:end=3,setpts=PTS-STARTPTS,format=rgba[e0a];[e0a][1:v]overlay=0:0:format=auto,format=yuv420p,setpts=PTS+1/TB[fx0c]',
    );
    expect(g).toContain(
      "[fx0a][fx0c]overlay=eof_action=pass:enable='between(t\\,1\\,3)'[fx0]",
    );
    expect(g).toContain('[fx0]split[fx1a][fx1b]');
    expect(g).toContain('[fx1]null[outv]');
  });

  it('adjusts a clip and shows part of its filter', async () => {
    await exported(
      studioProject([
        studioTrack('v1', 'video', [
          mediaClip('a', {
            startAt: 0,
            duration: 4,
            color: {
              brightness: 0,
              contrast: 50,
              saturation: 0,
              warmth: 0,
              exposure: 0,
              sharpness: 0,
            },
            filter: 'grayscale(1)',
            filterIntensity: 40,
          }),
        ]),
      ]),
    );
    expect(graph()).toContain(
      'eq=contrast=1.5:saturation=1,format=rgba,split[f0a][f0b];[f0b]colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3,format=rgba[f0c];[f0a][f0c]blend=all_mode=normal:all_opacity=0.4',
    );
  });

  it('leaves a filter out at no intensity', async () => {
    await exported(
      studioProject([
        studioTrack('v1', 'video', [
          mediaClip('a', {
            startAt: 0,
            duration: 4,
            filter: 'grayscale(1)',
            filterIntensity: 0,
          }),
        ]),
      ]),
    );
    expect(graph()).not.toContain('colorchannelmixer');
  });
});
