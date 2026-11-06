import { describe, expect, it } from 'vitest';
import { mediaClip, studioTrack } from '../test/studio-fixtures';
import type { MediaClip, StudioProject, Track } from '../types/studio';
import { buildAudioChain } from './ffmpegExport';
import {
  clampFade,
  clipGainAt,
  DUCK_GAIN,
  DUCK_RAMP_SEC,
  duckFilter,
  duckGainAt,
  ducksUnderVoice,
  fadeFilters,
  fadeGainAt,
  isSoundTrack,
  MAX_FADE_SEC,
  voiceSpans,
  withDetachedSound,
} from './studioAudio';

const project = (
  tracks: Track[],
  over: Partial<StudioProject> = {},
): StudioProject => ({
  id: 'p',
  name: 'P',
  duration: 20,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  tracks,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const sound = (id: string, over: Partial<MediaClip> = {}) =>
  mediaClip(id, { type: 'audio', startAt: 0, duration: 10, ...over });

const withVoice = (over: Partial<StudioProject> = {}) =>
  project(
    [
      studioTrack('v1', 'video'),
      studioTrack('m', 'audio', [sound('song', { trackId: 'm' })]),
      studioTrack('vo', 'voice', [
        sound('voice', { trackId: 'vo', startAt: 4, duration: 2 }),
      ]),
    ],
    over,
  );

describe('sound layers and the drop under a voice', () => {
  it('tells sound layers from the others', () => {
    expect(
      ['audio', 'voice', 'video', 'text'].map((type) =>
        isSoundTrack(studioTrack('x', type as Track['type'])),
      ),
    ).toEqual([true, true, false, false]);
  });

  it('drops other sound under a voice unless the project turns it off', () => {
    expect(ducksUnderVoice(withVoice())).toBe(true);
    expect(ducksUnderVoice(withVoice({ duckUnderVoice: false }))).toBe(false);
  });

  it('knows when a voice is heard, leaving out silenced voices', () => {
    const p = withVoice();
    expect(voiceSpans(p)).toEqual([[4, 6]]);
    p.tracks[2].clips[0] = {
      ...(p.tracks[2].clips[0] as MediaClip),
      muted: true,
    };
    expect(voiceSpans(p)).toEqual([]);
    p.tracks[2].muted = true;
    expect(voiceSpans(p)).toEqual([]);
  });

  it('drops to the duck level under a voice, with a ramp either side', () => {
    const spans: [number, number][] = [[4, 6]];
    expect(duckGainAt(spans, 1)).toBe(1);
    expect(duckGainAt(spans, 5)).toBeCloseTo(DUCK_GAIN);
    expect(duckGainAt(spans, 4 - DUCK_RAMP_SEC / 2)).toBeCloseTo(
      1 - (1 - DUCK_GAIN) / 2,
    );
    expect(duckGainAt(spans, 6 + DUCK_RAMP_SEC)).toBe(1);
    expect(duckGainAt([], 5)).toBe(1);
  });

  it('writes the same drop for ffmpeg, and none with no voice', () => {
    expect(duckFilter([])).toBeNull();
    const filter = duckFilter([
      [4, 6],
      [8, 9],
    ]);
    expect(filter).toContain(':eval=frame');
    expect(filter).toContain('max(');
    expect(filter).toContain((1 - DUCK_GAIN).toFixed(4));
  });
});

describe('fades', () => {
  it('stay within three seconds, half the clip, and their steps', () => {
    expect(clampFade(5, 20)).toBe(MAX_FADE_SEC);
    expect(clampFade(5, 4)).toBe(2);
    expect(clampFade(0.26, 10)).toBe(0.3);
    expect(clampFade(-1, 10)).toBe(0);
  });

  it('raise a clip at its start and lower it at its end', () => {
    const clip = sound('s', {
      startAt: 2,
      duration: 10,
      fadeIn: 2,
      fadeOut: 4,
    });
    expect(fadeGainAt(clip, 3)).toBeCloseTo(0.5);
    expect(fadeGainAt(clip, 6)).toBe(1);
    expect(fadeGainAt(clip, 11)).toBeCloseTo(0.25);
    expect(fadeGainAt(clip, 1)).toBe(0);
    expect(fadeGainAt(sound('plain'), 5)).toBe(1);
  });

  it('are written for ffmpeg in the clip own time', () => {
    expect(
      fadeFilters(sound('s', { duration: 10, fadeIn: 1, fadeOut: 2 })),
    ).toEqual(['afade=t=in:st=0:d=1', 'afade=t=out:st=8:d=2']);
    expect(fadeFilters(sound('none'))).toEqual([]);
  });
});

describe('how loud a clip plays', () => {
  it('is its volume, its fades and the drop under a voice; a voice does not drop', () => {
    const p = withVoice();
    const song = p.tracks[1].clips[0] as MediaClip;
    expect(clipGainAt(p, { ...song, volume: 0.5 }, 1, false)).toBeCloseTo(0.5);
    expect(clipGainAt(p, song, 5, false)).toBeCloseTo(DUCK_GAIN);
    expect(clipGainAt(p, song, 5, true)).toBe(1);
    expect(
      clipGainAt(withVoice({ duckUnderVoice: false }), song, 5, false),
    ).toBe(1);
    expect(clipGainAt(p, { ...song, muted: true }, 1, false)).toBe(0);
  });

  it('is exported with its fades and the drop', () => {
    const chain = buildAudioChain(
      sound('s', { startAt: 2, fadeIn: 1 }),
      "volume='x'",
    );
    expect(chain).toBe(
      "atrim=start=0:duration=10,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1,adelay=2000|2000,volume='x'",
    );
  });
});

describe('taking a video sound out', () => {
  const p = () =>
    project([
      studioTrack('v1', 'video', [
        mediaClip('vid', {
          trackId: 'v1',
          startAt: 0,
          duration: 6,
          mediaStart: 1,
          filter: 'sepia(1)',
        }),
      ]),
    ]);
  const newTrack = () => studioTrack('new-audio', 'audio');

  it('puts it on a new sound layer, aligned, and silences the video', () => {
    const done = withDetachedSound(p(), 'vid', newTrack);
    expect(done).not.toBeNull();
    const tracks = done?.project.tracks ?? [];
    expect((tracks[0].clips[0] as MediaClip).muted).toBe(true);
    expect(tracks[1].clips[0]).toMatchObject({
      id: done?.soundId,
      type: 'audio',
      trackId: 'new-audio',
      startAt: 0,
      duration: 6,
      mediaStart: 1,
      muted: false,
      filter: undefined,
      detachedFrom: 'vid',
    });
  });

  it('uses a sound layer free at that time when there is one', () => {
    const base = p();
    base.tracks.push(
      studioTrack('free', 'audio', [
        sound('later', { trackId: 'free', startAt: 10, duration: 2 }),
      ]),
    );
    const done = withDetachedSound(base, 'vid', newTrack);
    expect(done?.project.tracks).toHaveLength(2);
    expect(done?.project.tracks[1].clips.map((c) => c.id)).toEqual([
      'later',
      done?.soundId,
    ]);
  });

  it('does nothing for a clip that is not a video', () => {
    const base = project([
      studioTrack('v1', 'video', [
        mediaClip('img', { trackId: 'v1', type: 'image' }),
      ]),
    ]);
    expect(withDetachedSound(base, 'img', newTrack)).toBeNull();
    expect(withDetachedSound(base, 'missing', newTrack)).toBeNull();
  });
});
