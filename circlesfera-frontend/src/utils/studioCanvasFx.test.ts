import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectClip } from '../test/studio-fixtures';
import type { EffectKind, TransitionKind } from '../types/studio';
import {
  drawEffect,
  drawTransition,
  drawVignette,
  liftPicture,
  sampled,
  scratchCanvas,
  sharpenPicture,
  sharpenWeight,
  smoothstep,
  transitionWeights,
  vignetteMaskPng,
  warmPicture,
} from './studioCanvasFx';

type Call = {
  op: string;
  args: unknown[];
  alpha: number;
  mode: string;
  filter: string;
};

// A 2D context that writes down what is drawn, and how.
function recorder() {
  const calls: Call[] = [];
  const ctx: Record<string, unknown> = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    fillStyle: '#000',
  };
  const stack: Record<string, unknown>[] = [];
  const note =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({
        op,
        args,
        alpha: ctx.globalAlpha as number,
        mode: ctx.globalCompositeOperation as string,
        filter: ctx.filter as string,
      });
    };
  for (const op of [
    'drawImage',
    'fillRect',
    'clearRect',
    'translate',
    'scale',
    'putImageData',
  ]) {
    ctx[op] = note(op);
  }
  ctx.save = () => stack.push({ ...ctx });
  ctx.restore = () => Object.assign(ctx, stack.pop());
  ctx.createRadialGradient = () => ({
    addColorStop: (at: number, color: string) =>
      calls.push({
        op: 'stop',
        args: [at, color],
        alpha: 1,
        mode: '',
        filter: '',
      }),
  });
  ctx.createImageData = (w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4),
  });
  ctx.createPattern = () => 'pattern';
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

let contexts: ReturnType<typeof recorder>[];
beforeEach(() => {
  contexts = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement) {
      const self = this as HTMLCanvasElement & {
        __rec?: ReturnType<typeof recorder>;
      };
      if (!self.__rec) {
        self.__rec = recorder();
        contexts.push(self.__rec);
      }
      return self.__rec.ctx as never;
    },
  );
});
afterEach(() => vi.restoreAllMocks());

const canvas = (width = 100, height = 200) => {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
};
const recOf = (c: HTMLCanvasElement) => {
  c.getContext('2d');
  return (c as unknown as { __rec: ReturnType<typeof recorder> }).__rec;
};

describe('the shapes of a transition', () => {
  it('eases in and out between its edges', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it('reads a table taken every twentieth of the way, between its values', () => {
    const table = Array.from({ length: 21 }, (_, i) => i / 20);
    expect(sampled(table, 0.525)).toBeCloseTo(0.525);
    expect(sampled(table, 2)).toBe(1);
    expect(sampled([1, 0.5], 0.025)).toBeCloseTo(0.75);
    expect(sampled([1, 0.5], 0.5)).toBe(0);
  });

  it('weighs the two clips as ffmpeg draws each transition', () => {
    expect(transitionWeights('crossfade', 0.25)).toEqual({
      out: 0.75,
      in: 0.25,
    });
    expect(transitionWeights('fadeblack', 0)).toEqual({ out: 1, in: 0 });
    expect(transitionWeights('fadeblack', 0.25)).toEqual({ out: 0, in: 0 });
    expect(transitionWeights('fadeblack', 0.3)).toEqual({ out: 0, in: 0.02 });
    expect(transitionWeights('fadeblack', 1).in).toBe(1);
    expect(transitionWeights('zoomin', 0.4)).toEqual({ out: 1, in: 0 });
    expect(transitionWeights('zoomin', 0.75)).toEqual({ out: 0.5, in: 0.5 });
  });
});

describe('drawing a transition', () => {
  const draw = (kind: TransitionKind, p: number) => {
    const { ctx, calls } = recorder();
    const from = canvas();
    const to = canvas();
    drawTransition(ctx, from, to, kind, p, 100, 200);
    return { calls, from, to };
  };

  it.each([
    ['slideleft', [-30, 0], [70, 0]],
    ['slideright', [30, 0], [-70, 0]],
    ['slideup', [0, -60], [0, 140]],
    ['slidedown', [0, 60], [0, -140]],
  ] as [TransitionKind, number[], number[]][])(
    'pushes the old clip out with %s',
    (kind, fromAt, toAt) => {
      const { calls, from, to } = draw(kind, 0.3);
      const images = calls.filter((c) => c.op === 'drawImage');
      expect(images[0].args.slice(0, 3)).toEqual([from, ...fromAt]);
      expect(images[1].args.slice(0, 3)).toEqual([to, ...toAt]);
    },
  );

  it('crossfades over black, adding the two at their shares', () => {
    const { calls } = draw('crossfade', 0.25);
    expect(calls[0]).toMatchObject({ op: 'fillRect' });
    const images = calls.filter((c) => c.op === 'drawImage');
    expect(images.map((c) => [c.alpha, c.mode])).toEqual([
      [0.75, 'lighter'],
      [0.25, 'lighter'],
    ]);
  });

  it('zooms the old clip into its middle while the new one shows', () => {
    const { calls, to } = draw('zoomin', 0.25);
    expect(calls[0]).toMatchObject({
      op: 'drawImage',
      args: [to, 0, 0, 100, 200],
    });
    expect(calls.find((c) => c.op === 'scale')?.args).toEqual([2, 2]);
  });

  it('smears the pictures sideways, most halfway, not at the ends', () => {
    const middle = draw('blur', 0.5).calls.filter((c) => c.op === 'drawImage');
    expect(middle).toHaveLength(16);
    expect(middle[0].args[1]).toBe(-25);
    const end = draw('blur', 1).calls.filter((c) => c.op === 'drawImage');
    expect(end).toHaveLength(2);
  });
});

describe('drawing on a picture', () => {
  it('keeps a canvas to draw on, at the size asked', () => {
    const cache = { current: null as HTMLCanvasElement | null };
    const first = scratchCanvas(cache, 10, 20);
    expect(scratchCanvas(cache, 30, 40)).toBe(first);
    expect([first.width, first.height]).toEqual([30, 40]);
  });

  it('lifts and warms only where the picture shows', () => {
    const picture = canvas();
    const copy = canvas();
    liftPicture(picture, copy, 0.2);
    warmPicture(picture, copy, -0.3);
    const ops = recOf(picture).calls.map((c) => [c.op, c.mode, c.alpha]);
    expect(ops).toEqual([
      ['fillRect', 'lighter', 0.2],
      ['drawImage', 'destination-in', 1],
      ['fillRect', 'soft-light', 0.3],
      ['drawImage', 'destination-in', 1],
    ]);
    liftPicture(picture, copy, 0);
    warmPicture(picture, copy, 0);
    expect(recOf(picture).calls).toHaveLength(4);
  });

  it('sharpens with the kernel the export uses', () => {
    const picture = canvas(3, 3);
    const rec = recOf(picture);
    const data = new Uint8ClampedArray(36).fill(100);
    data[16] = 200; // the middle pixel, red
    (rec.ctx as unknown as Record<string, unknown>).getImageData = () => ({
      data,
    });
    sharpenPicture(picture, 0.4);
    const a = sharpenWeight(0.4);
    expect(a).toBe(0.1);
    expect(data[16]).toBe(Math.round((1 + 4 * a) * 200 - a * 400));
    // Values stay within what a pixel holds.
    data[16] = 250;
    sharpenPicture(picture, 1.5);
    expect(data[16]).toBe(255);
    sharpenPicture(picture, 0);
    (rec.ctx as unknown as Record<string, unknown>).getImageData = () => {
      throw new DOMException('tainted', 'SecurityError');
    };
    expect(() => sharpenPicture(picture, 1)).not.toThrow();
    expect(rec.calls.filter((c) => c.op === 'putImageData')).toHaveLength(2);
  });

  it('darkens a vignette by the same stops as the export’s mask', async () => {
    const { ctx, calls } = recorder();
    drawVignette(ctx, 100, 200, 0.8);
    expect(calls.filter((c) => c.op === 'stop').map((c) => c.args)).toEqual([
      [0, 'rgba(0,0,0,0)'],
      [0.25, 'rgba(0,0,0,0.05)'],
      [0.5, 'rgba(0,0,0,0.2)'],
      [0.75, 'rgba(0,0,0,0.45)'],
      [1, 'rgba(0,0,0,0.8)'],
    ]);
    drawVignette(null, 1, 1, 1);
    HTMLCanvasElement.prototype.toBlob = (done: BlobCallback) => {
      done(new Blob([new Uint8Array([1, 2])]));
    };
    expect(await vignetteMaskPng(10, 20, 0.5)).toEqual(new Uint8Array([1, 2]));
    HTMLCanvasElement.prototype.toBlob = (done: BlobCallback) => {
      done(null);
    };
    await expect(vignetteMaskPng(10, 20, 0.5)).rejects.toThrow();
  });
});

describe('drawing an effect', () => {
  const run = (effect: EffectKind, t = 1, intensity = 100) => {
    const target = canvas(1080, 1920);
    drawEffect(
      target,
      canvas(1080, 1920),
      effectClip('x', { effect, intensity, duration: 2 }),
      t,
    );
    return recOf(target).calls;
  };

  it('blurs, greys and glows the picture as the export does', () => {
    expect(run('blur').find((c) => c.op === 'drawImage')?.filter).toBe(
      'blur(20px)',
    );
    expect(run('mono', 1, 50).find((c) => c.op === 'drawImage')?.filter).toBe(
      'grayscale(0.5)',
    );
    const glow = run('glow', 1, 40).find((c) => c.op === 'drawImage');
    expect(glow).toMatchObject({
      mode: 'screen',
      alpha: 0.4,
      filter: 'blur(12px)',
    });
  });

  it('moves a shaking picture and zooms a slow zoom over its length', () => {
    const shake = run('shake', 0);
    expect(shake.filter((c) => c.op === 'translate')[0].args).toEqual([
      540,
      1920 / 2 - 32.4,
    ]);
    const zoom = run('slowzoom', 1);
    expect(zoom.find((c) => c.op === 'scale')?.args).toEqual([1.15, 1.15]);
  });

  it('lays a vignette and grain over it', () => {
    expect(run('vignette').some((c) => c.op === 'stop')).toBe(true);
    expect(run('grain').find((c) => c.op === 'fillRect')?.mode).toBe('overlay');
  });

  it('splits the colours, red one way and blue the other', () => {
    run('rgbsplit');
    const channel = contexts[contexts.length - 1];
    const shifts = channel.calls
      .filter((c) => c.op === 'drawImage')
      .map((c) => c.args[1]);
    expect(shifts).toEqual([-22, 0, 22]);
  });
});
