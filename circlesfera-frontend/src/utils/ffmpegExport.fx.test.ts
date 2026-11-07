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
      "color=c=black:s=1080x1920:r=30:d=4[bg0];[bg0][seg0]overlay=x='(W-w)/2+0':y='(H-h)/2+0',format=yuv420p,setsar=1,fps=30,settb=AVTB[m0]",
    );
    expect(g).toContain(
      '[m0][m1]xfade=transition=slideleft:duration=0.5:offset=3.5[j0]',
    );
    expect(g).toContain('[j0][m2]concat=n=2:v=1:a=0[j1]');
    expect(g).toContain('[basev][j1]overlay=eof_action=pass[mainv]');
    expect(g).toContain('[mainv][seg3]overlay=');
    // The main clips are not laid over the base one by one.
    expect(g).not.toContain('[basev][seg0]');
    // Joined clips start at 0, for the join to place them; a layer starts
    // where it starts on the timeline.
    const chainOf = (input: number) =>
      g.split(';').find((part) => part.startsWith(`[${input}:v]`)) ?? '';
    expect(chainOf(2)).not.toContain('setpts=PTS+');
    expect(chainOf(3)).toMatch(/,setpts=PTS\+1\/TB\[seg3\]$/);
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
              warmth: 30,
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
      'eq=contrast=1.5:saturation=1,format=rgba,split[f0a][f0b];[f0b]colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3,format=rgba[f0c];[f0c][f0a]blend=all_mode=normal:all_opacity=0.4',
    );
    // Warmth goes on after the filter, as the preview lays it on: a grey
    // filter keeps the tint.
    const g = graph();
    expect(g.indexOf('drawbox=c=0xff9a3c')).toBeGreaterThan(
      g.indexOf('colorchannelmixer=.3'),
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

  it('keys a layer, cuts it to a shape before it turns, and blends it in RGB', async () => {
    await exported(
      studioProject([
        studioTrack('v1', 'video', [
          mediaClip('a', { startAt: 0, duration: 4 }),
        ]),
        studioTrack('v2', 'video', [
          mediaClip('over', {
            trackId: 'v2',
            startAt: 1,
            duration: 2,
            chroma: { color: '#00ff00', strength: 40, softness: 20 },
            shape: 'circle',
            blend: 'screen',
            transform: { scale: 0.5, rotation: 30, x: 0, y: 0 },
          }),
        ]),
      ]),
    );
    const g = graph();
    const chain = g.split(';').find((p) => p.startsWith('[1:v]')) ?? '';
    const at = (part: string) => g.indexOf(part);
    expect(chain).toContain('format=rgba,colorkey=0x00ff00:0.2:0.06');
    expect(at('colorkey')).toBeLessThan(at('[s1b]alphaextract'));
    expect(at('[s1a][s1c]alphamerge')).toBeLessThan(at('rotate=30*PI/180'));
    expect(g).toContain('[ov0]split[b1a][b1b]');
    expect(g).toContain('[b1f][b1g]blend=all_mode=screen,format=rgba[b1h]');
    expect(g).toContain(
      "[b1a][b1i]overlay=format=auto:enable='between(t\\,1\\,3)'[ov1]",
    );
  });

  it('lays a normal layer straight over the picture', async () => {
    await exported(
      studioProject([
        studioTrack('v1', 'video', [
          mediaClip('a', { startAt: 0, duration: 4 }),
        ]),
        studioTrack('v2', 'video', [
          mediaClip('over', {
            trackId: 'v2',
            startAt: 0,
            duration: 2,
            blend: 'normal',
          }),
        ]),
      ]),
    );
    expect(graph()).not.toContain('blend=all_mode=normal,format=rgba[b');
    expect(graph()).toContain('[ov0][seg1]overlay=');
  });

  it('sends animated values frame by frame, in each clip’s own time', async () => {
    const k = (pairs: [number, number][]) => pairs.map(([t, v]) => ({ t, v }));
    await exported(
      studioProject([
        studioTrack('v1', 'video', [
          mediaClip('a', {
            startAt: 0,
            duration: 2,
            keyframes: {
              warmth: k([
                [0, 0],
                [2, 100],
              ]),
              volume: k([
                [0, 0],
                [2, 1],
              ]),
            },
          }),
        ]),
        studioTrack('v2', 'video', [
          mediaClip('over', {
            trackId: 'v2',
            startAt: 1,
            duration: 1,
            muted: true,
            keyframes: {
              x: k([
                [0, 0],
                [1, 100],
              ]),
              opacity: k([
                [0, 1],
                [1, 0],
              ]),
            },
          }),
        ]),
      ]),
    );
    const g = graph();
    const first = g.split(';').find((p) => p.startsWith('[0:v]')) ?? '';
    // The script goes in after the trim, before the clip is resized.
    expect(first).toMatch(/setpts=PTS-STARTPTS,sendcmd=f=cmd_0\.txt,scale=/);
    expect(written).toEqual(expect.arrayContaining(['cmd_0.txt', 'cmd_1.txt']));
    expect(g).toContain("volume='max(0\\,");
    expect(g).toContain(':eval=frame,adelay=0|0');
    // A layer's move counts from its own start.
    expect(g).toMatch(/overlay=x='\(W-w\)\/2\+\(0\+100\*clip\(\(\(t-1\)-0\)/);
    expect(g).toContain('colorchannelmixer@o1=aa=1');
  });

  it('draws a growing text at its largest on a clear layer that grows', async () => {
    await exported(
      studioProject([
        studioTrack('v1', 'video', [
          mediaClip('a', { startAt: 0, duration: 3 }),
        ]),
        studioTrack('t1', 'text', [
          {
            id: 'w',
            type: 'text',
            trackId: 't1',
            startAt: 0,
            duration: 3,
            content: 'Hi',
            style: {
              fontFamily: 'Roboto',
              fontSize: 40,
              color: '#ffffff',
              backgroundColor: 'transparent',
              textAlign: 'center',
            },
            transform: { scale: 1, rotation: 0, x: 0, y: 0 },
            keyframes: {
              scale: [
                { t: 0, v: 1 },
                { t: 3, v: 2 },
              ],
            },
          },
        ]),
      ]),
    );
    const g = graph();
    expect(g).toContain(
      'color=c=black@0:s=1080x1920:r=30:d=3,format=rgba,drawtext=',
    );
    expect(g).toContain(':fontsize=80:');
    expect(g).toContain(
      "pad=w=1080:h=1920:x='(ow-iw)/2':y='(oh-ih)/2':color=black@0:eval=frame[txt0g]",
    );
    expect(g).toContain('[ov0][txt0g]overlay=');
  });
});
