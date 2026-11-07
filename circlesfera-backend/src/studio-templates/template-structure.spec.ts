import { describe, expect, it } from 'vitest';
import {
  InvalidTemplateError,
  TEMPLATE_LIMITS,
  templateStructureOf,
} from './template-structure.js';

const slot = { duration: 2, speed: 1 };
const valid = {
  version: 1,
  aspectRatio: '9:16',
  slots: [
    {
      ...slot,
      transitionOut: { kind: 'crossfade', duration: 0.5 },
      filter: 'grayscale(1) contrast(1.2)',
      filterIntensity: 40,
      color: { brightness: 10, warmth: -20 },
      keyframes: {
        scale: [
          { t: 0, v: 1 },
          { t: 2, v: 1.2 },
        ],
      },
      // Anything a template does not have goes.
      fileUrl: 'https://cdn/someone.mp4',
      content: 'a text',
    },
    slot,
  ],
  effects: [
    { startAt: 0, duration: 2, effect: 'vignette', intensity: 40, id: 'x' },
  ],
  song: {
    audioId: 'a',
    url: 'https://cdn/song.mp3',
    title: 'Mine',
    mediaStart: 3,
    startAt: 0,
    duration: 4,
  },
  voice: 'https://cdn/voice.webm',
};

describe('a template’s structure', () => {
  it('is rebuilt from the fields a template has, without media, text or anything else', () => {
    const structure = templateStructureOf(valid, 'Name');
    expect(structure).toEqual({
      version: 1,
      name: 'Name',
      aspectRatio: '9:16',
      slots: [
        {
          duration: 2,
          speed: 1,
          transitionOut: { kind: 'crossfade', duration: 0.5 },
          filter: 'grayscale(1) contrast(1.2)',
          filterIntensity: 40,
          color: {
            brightness: 10,
            contrast: 0,
            saturation: 0,
            warmth: -20,
            exposure: 0,
            sharpness: 0,
          },
          keyframes: {
            scale: [
              { t: 0, v: 1 },
              { t: 2, v: 1.2 },
            ],
          },
        },
        { duration: 2, speed: 1 },
      ],
      effects: [{ startAt: 0, duration: 2, effect: 'vignette', intensity: 40 }],
      song: {
        audioId: 'a',
        url: 'https://cdn/song.mp3',
        title: '',
        mediaStart: 3,
        startAt: 0,
        duration: 4,
      },
    });
    expect(JSON.stringify(structure)).not.toMatch(/someone|a text|voice/);
  });

  it('takes no song, no effects and an empty filter', () => {
    const structure = templateStructureOf(
      {
        version: 1,
        aspectRatio: '1:1',
        slots: [{ ...slot, filter: '' }],
        song: null,
      },
      'N',
    );
    expect(structure.effects).toEqual([]);
    expect(structure.song).toBeUndefined();
    expect(structure.slots[0]).toEqual(slot);
  });

  const bad = (change: (t: Record<string, unknown>) => void) => {
    const t = structuredClone(valid) as Record<string, unknown>;
    change(t);
    return () => templateStructureOf(t, 'N');
  };
  const slot0 = (t: Record<string, unknown>) =>
    (t.slots as Record<string, unknown>[])[0];

  it.each([
    ['not an object', () => () => templateStructureOf('x', 'N')],
    [
      'another version',
      () =>
        bad((t) => {
          t.version = 2;
        }),
    ],
    [
      'no slots',
      () =>
        bad((t) => {
          t.slots = [];
        }),
    ],
    [
      'too many slots',
      () =>
        bad((t) => {
          t.slots = Array(TEMPLATE_LIMITS.slots + 1).fill(slot);
        }),
    ],
    [
      'a slot that is not an object',
      () =>
        bad((t) => {
          t.slots = ['x'];
        }),
    ],
    [
      'a slot too long',
      () =>
        bad((t) => {
          slot0(t).duration = 601;
        }),
    ],
    [
      'a speed out of bounds',
      () =>
        bad((t) => {
          slot0(t).speed = 9;
        }),
    ],
    [
      'an unknown format',
      () =>
        bad((t) => {
          t.aspectRatio = '3:2';
        }),
    ],
    [
      'an unknown transition',
      () =>
        bad((t) => {
          slot0(t).transitionOut = { kind: 'spin', duration: 1 };
        }),
    ],
    [
      'a transition that is not an object',
      () =>
        bad((t) => {
          slot0(t).transitionOut = 'fade';
        }),
    ],
    [
      'a filter with an address',
      () =>
        bad((t) => {
          slot0(t).filter = 'url(https://x/y.svg#f)';
        }),
    ],
    [
      'a filter that is not text',
      () =>
        bad((t) => {
          slot0(t).filter = 3;
        }),
    ],
    [
      'a colour that is not an object',
      () =>
        bad((t) => {
          slot0(t).color = 4;
        }),
    ],
    [
      'a colour out of bounds',
      () =>
        bad((t) => {
          slot0(t).color = { warmth: 500 };
        }),
    ],
    [
      'keyframes that are not an object',
      () =>
        bad((t) => {
          slot0(t).keyframes = [];
        }),
    ],
    [
      'an unknown keyframed property',
      () =>
        bad((t) => {
          slot0(t).keyframes = { src: [] };
        }),
    ],
    [
      'a keyframe that is not an object',
      () =>
        bad((t) => {
          slot0(t).keyframes = { x: [3] };
        }),
    ],
    [
      'too many keyframes',
      () =>
        bad((t) => {
          slot0(t).keyframes = { x: Array(51).fill({ t: 0, v: 0 }) };
        }),
    ],
    [
      'an unknown effect',
      () =>
        bad((t) => {
          t.effects = [
            { startAt: 0, duration: 1, effect: 'fire', intensity: 1 },
          ];
        }),
    ],
    [
      'an effect that is not an object',
      () =>
        bad((t) => {
          t.effects = [1];
        }),
    ],
    [
      'effects that are not a list',
      () =>
        bad((t) => {
          t.effects = {};
        }),
    ],
    [
      'a song that is not an object',
      () =>
        bad((t) => {
          t.song = 'x';
        }),
    ],
    [
      'a song without an id',
      () =>
        bad((t) => {
          t.song = { url: 'u', mediaStart: 0, startAt: 0, duration: 1 };
        }),
    ],
    [
      'a number that is not one',
      () =>
        bad((t) => {
          slot0(t).duration = Number.NaN;
        }),
    ],
  ])('refuses %s', (_what, make) => {
    expect(make()).toThrow(InvalidTemplateError);
  });
});
