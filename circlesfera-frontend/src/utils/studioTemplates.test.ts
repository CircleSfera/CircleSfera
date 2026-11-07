import { describe, expect, it } from 'vitest';
import {
  effectClip,
  mediaClip,
  studioProject,
  studioTrack,
  textClip,
} from '../test/studio-fixtures';
import type { EffectClip, MediaClip } from '../types/studio';
import {
  BUILT_IN_TEMPLATES,
  projectFromTemplate,
  type StudioTemplate,
  templateLength,
  templateOf,
  templateOfState,
} from './studioTemplates';
import { mainClips } from './studioTimeline';

const t = (key: string) => key;
const fade = { kind: 'crossfade' as const, duration: 0.5 };

const source = () =>
  studioProject(
    [
      studioTrack('v1', 'video', [
        mediaClip('a', {
          startAt: 0,
          duration: 3,
          transitionOut: fade,
          filter: 'sepia(1)',
          filterIntensity: 60,
          color: {
            brightness: 0,
            contrast: 10,
            saturation: 0,
            warmth: 20,
            exposure: 0,
            sharpness: 0,
          },
          keyframes: {
            scale: [
              { t: 0, v: 1 },
              { t: 3, v: 1.2 },
            ],
          },
        }),
        mediaClip('b', { startAt: 2.5, duration: 2, type: 'image', speed: 1 }),
      ]),
      studioTrack('v2', 'video', [mediaClip('overlay', { trackId: 'v2' })]),
      studioTrack('t1', 'text', [textClip('words')]),
      studioTrack('fx', 'effect', [
        effectClip('e', {
          startAt: 1,
          duration: 2,
          effect: 'grain',
          intensity: 30,
        }),
      ]),
      studioTrack('m', 'audio', [
        mediaClip('upload', {
          type: 'audio',
          trackId: 'm',
          startAt: 0,
          fileUrl: 'https://cdn/mine.mp3',
        }),
        mediaClip('song', {
          type: 'audio',
          trackId: 'm',
          startAt: 0.5,
          duration: 4,
          audioId: 'song-1',
          label: 'Sunrise',
          mediaStart: 12,
          fileUrl: 'https://cdn/library/sunrise.mp3',
        }),
      ]),
      studioTrack('vo', 'voice', [
        mediaClip('voice', { type: 'audio', trackId: 'vo' }),
      ]),
    ],
    { aspectRatio: '4:5' },
  );

describe('a template of a project', () => {
  it('keeps the timing and look of the main track, its effects and its library song', () => {
    const template = templateOf(source(), 'Mine');
    expect(template).toEqual({
      version: 1,
      name: 'Mine',
      aspectRatio: '4:5',
      slots: [
        {
          duration: 3,
          speed: 1,
          transitionOut: fade,
          filter: 'sepia(1)',
          filterIntensity: 60,
          color: {
            brightness: 0,
            contrast: 10,
            saturation: 0,
            warmth: 20,
            exposure: 0,
            sharpness: 0,
          },
          keyframes: {
            scale: [
              { t: 0, v: 1 },
              { t: 3, v: 1.2 },
            ],
          },
        },
        { duration: 2, speed: 1 },
      ],
      effects: [{ startAt: 1, duration: 2, effect: 'grain', intensity: 30 }],
      song: {
        audioId: 'song-1',
        url: 'https://cdn/library/sunrise.mp3',
        title: 'Sunrise',
        mediaStart: 12,
        startAt: 0.5,
        duration: 4,
      },
    });
  });

  it('carries nobody’s media, voice or text', () => {
    const saved = JSON.stringify(templateOf(source(), 'Mine'));
    for (const own of [
      'cdn.example.com',
      'mine.mp3',
      'Hello',
      'overlay',
      'voice',
    ]) {
      expect(saved).not.toContain(own);
    }
  });

  it('lasts as its slots do, less the transitions between them', () => {
    expect(templateLength(templateOf(source(), 'Mine'))).toBe(4.5);
  });

  it('is read back only from a saved template', () => {
    const template = templateOf(source(), 'Mine');
    expect(templateOfState({ kind: 'template', template })).toBe(template);
    expect(templateOfState({ version: 3, studio: {} })).toBeNull();
    expect(templateOfState(null)).toBeNull();
    expect(
      templateOfState({
        kind: 'template',
        template: { version: 2, slots: [] },
      }),
    ).toBeNull();
  });
});

describe('a project from a template', () => {
  const picks = [
    { file: null, url: 'blob:1', type: 'video' as const, sourceDuration: 1.2 },
    { file: null, url: 'blob:2', type: 'image' as const },
  ];

  it('fills its slots in order, a video no longer than it is, with the slot’s look', () => {
    const project = projectFromTemplate(
      templateOf(source(), 'Mine'),
      picks,
      'From template',
      t,
    );
    expect(project.name).toBe('From template');
    expect(project.aspectRatio).toBe('4:5');
    expect(project.resolution).toEqual({ width: 1080, height: 1350 });
    const [first, second] = mainClips(project) as MediaClip[];
    expect(first).toMatchObject({
      fileUrl: 'blob:1',
      type: 'video',
      duration: 1.2,
      sourceDuration: 1.2,
      muted: false,
      filter: 'sepia(1)',
      filterIntensity: 60,
      transitionOut: fade,
    });
    // Keyframes past the shorter clip go.
    expect(first.keyframes?.scale).toEqual([{ t: 0, v: 1 }]);
    expect(second).toMatchObject({
      fileUrl: 'blob:2',
      type: 'image',
      duration: 2,
      muted: true,
      startAt: 0.7,
    });
    expect(second.transitionOut).toBeUndefined();
  });

  it('brings its effects and song, cut to the new length', () => {
    const project = projectFromTemplate(
      templateOf(source(), 'Mine'),
      picks,
      'P',
      t,
    );
    const fx = project.tracks.find((tr) => tr.type === 'effect')
      ?.clips as EffectClip[];
    expect(fx).toEqual([
      expect.objectContaining({ startAt: 1, duration: 1.7, effect: 'grain' }),
    ]);
    const song = project.tracks.find((tr) => tr.type === 'audio')
      ?.clips[0] as MediaClip;
    expect(song).toMatchObject({
      audioId: 'song-1',
      label: 'Sunrise',
      startAt: 0.5,
      duration: 2.2,
      mediaStart: 12,
    });
    expect(project.duration).toBeGreaterThanOrEqual(2.7);
  });

  it('leaves out the slots nobody filled, and adds no layers it has no use for', () => {
    const template: StudioTemplate = {
      version: 1,
      name: 'x',
      aspectRatio: '9:16',
      slots: [
        { duration: 2, speed: 2, transitionOut: fade },
        { duration: 2, speed: 1 },
      ],
      effects: [{ startAt: 5, duration: 1, effect: 'blur', intensity: 10 }],
      song: {
        audioId: 's',
        url: 'u',
        title: 'S',
        mediaStart: 0,
        startAt: 9,
        duration: 1,
      },
    };
    const project = projectFromTemplate(
      template,
      [{ file: null, url: 'blob:1', type: 'video', sourceDuration: 10 }],
      'P',
      t,
    );
    expect(mainClips(project)).toHaveLength(1);
    expect((mainClips(project)[0] as MediaClip).transitionOut).toBeUndefined();
    expect((mainClips(project)[0] as MediaClip).speed).toBe(2);
    expect(project.tracks).toHaveLength(1);
    expect(projectFromTemplate(template, [], 'P', t).tracks[0].clips).toEqual(
      [],
    );
  });

  it('offers CircleSfera’s templates, each well formed', () => {
    expect(BUILT_IN_TEMPLATES.map((b) => b.id)).toEqual([
      'quick-cuts',
      'soft-story',
      'before-after',
      'trip',
    ]);
    for (const { template } of BUILT_IN_TEMPLATES) {
      expect(template.slots.length).toBeGreaterThan(1);
      for (const fx of template.effects) {
        expect(fx.startAt + fx.duration).toBeLessThanOrEqual(
          templateLength(template) + 1e-9,
        );
      }
    }
  });
});
