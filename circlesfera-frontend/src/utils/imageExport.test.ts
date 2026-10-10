import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportEditedImage } from './imageExport';

const photo = new File(['x'], 'beach.day.png', { type: 'image/png' });
const STYLE = 'filter-class:Custom__style:';

// What the browser would draw, recorded step by step, and where it can fail.
function browser({
  width = 400,
  height = 200,
  decode = true,
  context = true,
  finalContext = true,
  blob = true,
  overlayLoads = true,
  noiseLoads = true,
} = {}) {
  const steps: string[] = [];
  const canvases: { width: number; height: number }[] = [];
  const ctx: Record<string, unknown> = {
    set filter(value: string) {
      steps.push(`filter ${value}`);
    },
    set fillStyle(value: unknown) {
      steps.push(`fill ${typeof value === 'string' ? value : 'pattern'}`);
    },
    set globalAlpha(value: number) {
      steps.push(`alpha ${Math.round(value * 100) / 100}`);
    },
    set globalCompositeOperation(value: string) {
      steps.push(`blend ${value}`);
    },
    translate: (x: number, y: number) => steps.push(`translate ${x},${y}`),
    rotate: (rad: number) =>
      steps.push(`rotate ${Math.round(rad * 1000) / 1000}`),
    setTransform: () => steps.push('reset'),
    drawImage: (source: { kind?: string }, ...rest: number[]) =>
      steps.push(`draw ${source.kind ?? 'canvas'} ${rest.join(',')}`),
    fillRect: (...rect: number[]) => steps.push(`rect ${rect.join(',')}`),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    createPattern: () => ({}),
  };
  let made = 0;
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') return create(tag);
    const index = made++;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ((index === 0 ? context : finalContext) ? ctx : null),
      toBlob: (
        done: (b: Blob | null) => void,
        type: string,
        quality: number,
      ) => {
        canvases.push({ width: canvas.width, height: canvas.height });
        expect([type, quality]).toEqual(['image/jpeg', 0.95]);
        done(blob ? new Blob(['jpeg'], { type }) : null);
      },
    };
    return canvas as never;
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
  vi.stubGlobal(
    'Image',
    class {
      kind = 'photo';
      naturalWidth = width;
      naturalHeight = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        this.kind = value.startsWith('blob:')
          ? 'photo'
          : value.includes('svg')
            ? 'noise'
            : 'overlay';
        const loads =
          this.kind === 'photo'
            ? decode
            : this.kind === 'overlay'
              ? overlayLoads
              : noiseLoads;
        queueMicrotask(() => (loads ? this.onload?.() : this.onerror?.()));
      }
    },
  );
  return { steps, canvases };
}

describe('exportEditedImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('gives back a JPEG of the same size, named after the original', async () => {
    const { canvases, steps } = browser();

    const out = await exportEditedImage(photo, '');

    expect(out.name).toBe('edited_beach.day.jpg');
    expect(out.type).toBe('image/jpeg');
    expect(canvases).toEqual([{ width: 400, height: 200 }]);
    expect(steps.some((step) => step.startsWith('filter'))).toBe(false);
  });

  it('turns the filter of the editor into what the canvas understands', async () => {
    const { steps } = browser();

    await exportEditedImage(
      photo,
      'filter-class:grayscale brightness-110 contrast-90 saturate-150 hue-rotate-15 sepia-[.25] unknown__style:blur(1px)',
    );

    expect(steps).toContain(
      'filter grayscale(100%) brightness(110%) contrast(90%) saturate(150%) hue-rotate(15deg) sepia(25%) blur(1px)',
    );
  });

  it('warms or cools the picture with a tint as strong as the setting', async () => {
    const warm = browser();
    await exportEditedImage(photo, `${STYLE}__temp:160`);
    expect(warm.steps).toEqual(
      expect.arrayContaining(['blend color', 'fill #ff8c00', 'alpha 0.2']),
    );

    vi.restoreAllMocks();
    const cool = browser();
    await exportEditedImage(photo, `${STYLE}__temp:70`);
    expect(cool.steps).toEqual(
      expect.arrayContaining(['fill #0077ff', 'alpha 0.1']),
    );
  });

  it('darkens the corners and adds grain as much as set', async () => {
    const { steps } = browser();

    await exportEditedImage(photo, `${STYLE}__temp:100__vignette:40__noise:30`);

    expect(steps).toEqual(
      expect.arrayContaining([
        'alpha 0.4',
        'blend overlay',
        'alpha 0.3',
        'fill pattern',
      ]),
    );
    expect(steps).not.toContain('blend color');
  });

  it('turns the picture around its centre, in a space as big as the turned picture', async () => {
    const { steps } = browser();

    await exportEditedImage(photo, '', {
      x: 0,
      y: 0,
      width: 200,
      height: 400,
      rotation: 90,
    } as never);

    // 400×200 turned a quarter needs 200×400: its centre is at 100,200.
    const centre = steps.find((step) => step.startsWith('translate'));
    const [x, y] = centre!.replace('translate ', '').split(',').map(Number);
    expect([Math.round(x), Math.round(y)]).toEqual([100, 200]);
    expect(steps).toContain('rotate 1.571');
    expect(steps).toContain('translate -200,-100');
  });

  it('keeps only the part chosen when cropping', async () => {
    const { canvases, steps } = browser();

    await exportEditedImage(photo, '', {
      x: 20,
      y: 10,
      width: 100,
      height: 80,
      rotation: 0,
    } as never);

    expect(canvases).toEqual([{ width: 100, height: 80 }]);
    expect(steps).toContain('draw canvas 20,10,100,80,0,0,100,80');
  });

  it('draws what was added on top, over the whole picture', async () => {
    const { steps } = browser();

    await exportEditedImage(photo, '', undefined, 'data:image/png;base64,AAAA');

    expect(steps).toContain('draw overlay 0,0,400,200');
    expect(steps.indexOf('draw overlay 0,0,400,200')).toBeGreaterThan(
      steps.indexOf('draw photo 0,0'),
    );
  });

  it.each([
    ['what was added on top cannot be loaded', { overlayLoads: false }],
    ['the grain cannot be loaded', { noiseLoads: false }],
  ])('still exports the picture when %s', async (_case, failure) => {
    browser(failure);

    const out = await exportEditedImage(
      photo,
      `${STYLE}__temp:100__vignette:0__noise:20`,
      undefined,
      'data:image/png;base64,AAAA',
    );

    expect(out.name).toBe('edited_beach.day.jpg');
  });

  it.each([
    ['the browser gives no canvas', { context: false }],
    ['the browser gives no canvas for the crop', { finalContext: false }],
    ['the browser gives no JPEG', { blob: false }],
  ])('gives the original file back when %s', async (_case, failure) => {
    browser(failure);

    expect(await exportEditedImage(photo, '')).toBe(photo);
  });

  it('fails when the picture cannot be read', async () => {
    browser({ decode: false });

    await expect(exportEditedImage(photo, '')).rejects.toThrow(
      'Failed to load image for export.',
    );
  });
});
