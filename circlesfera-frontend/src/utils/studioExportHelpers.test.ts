import { describe, expect, it } from 'vitest';
import type { MediaClip, StudioProject, TextClip } from '../types/studio';
import { buildDrawTextFilter } from './ffmpegExport';
import {
  collectStudioMediaUrls,
  containRect,
  cssColorToFfmpeg,
  cssFilterToFfmpeg,
  isFfmpegEncodePreset,
  mapCaptionSegmentsToTimeline,
  resolutionForAspect,
  resolveStudioFontFile,
  StudioExportError,
  scaleResolutionForExport,
  visualClipsOnVideoTracks,
} from './studioExportHelpers';

const blankProject = (): StudioProject => ({
  id: 'p1',
  name: 'Test',
  duration: 10,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  tracks: [
    {
      id: 'v1',
      type: 'video',
      name: 'Video',
      clips: [],
      muted: false,
      hidden: false,
      locked: false,
    },
    {
      id: 'v2',
      type: 'video',
      name: 'Overlay',
      clips: [],
      muted: false,
      hidden: false,
      locked: false,
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const media = (id: string, trackId: string, startAt: number): MediaClip => ({
  id,
  trackId,
  type: 'video',
  file: null,
  fileUrl: `https://cdn.example.com/${id}.mp4`,
  startAt,
  duration: 2,
  mediaStart: 0,
  speed: 1,
  volume: 1,
  muted: false,
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
});

describe('studioExportHelpers (production fidelity)', () => {
  it('letterboxes containRect like FFmpeg decrease', () => {
    // 16:9 into 9:16 portrait → full width, letterbox top/bottom
    const fit = containRect(1920, 1080, 1080, 1920);
    expect(fit.w).toBe(1080);
    expect(fit.h).toBeCloseTo(607.5);
    expect(fit.x).toBe(0);
    expect(fit.y).toBeCloseTo((1920 - 607.5) / 2);
  });

  it('exports visual clips from all video tracks in track order', () => {
    const project = blankProject();
    project.tracks[0].clips.push(media('a', 'v1', 0));
    project.tracks[1].clips.push(media('b', 'v2', 0));
    const clips = visualClipsOnVideoTracks(project);
    expect(clips.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('collects remote studio media urls for draft cleanup', () => {
    const project = blankProject();
    project.tracks[0].clips.push(media('a', 'v1', 0));
    const urls = collectStudioMediaUrls({ version: 3, studio: project });
    expect(urls).toEqual(['https://cdn.example.com/a.mp4']);
  });

  it('converts css colors for drawtext', () => {
    expect(cssColorToFfmpeg('#ff00aa')).toBe('0xff00aa');
    expect(cssColorToFfmpeg('rgba(0,0,0,0.75)')).toBe('0x000000@0.75');
  });

  it('maps captions with trim window', () => {
    const clip = media('c1', 'v1', 5);
    clip.mediaStart = 2;
    clip.duration = 4;
    const mapped = mapCaptionSegmentsToTimeline(
      [{ start: 2.5, end: 4.5, text: 'hi' }],
      clip,
    );
    expect(mapped[0].startAt).toBeCloseTo(5.5);
  });

  it('builds drawtext with box color and stroke', () => {
    const tClip: TextClip = {
      id: 't1',
      trackId: 'tx',
      type: 'text',
      content: 'Hello:world',
      startAt: 1,
      duration: 2,
      style: {
        color: '#ffffff',
        fontSize: 32,
        fontFamily: 'Inter',
        backgroundColor: 'rgba(0,0,0,0.75)',
        padding: 8,
        textAlign: 'center',
        strokeColor: '#000000',
        strokeWidth: 2,
        shadowColor: 'rgba(0,0,0,0.5)',
      },
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
    };
    const filter = buildDrawTextFilter('basev', 'txt0', tClip, 1080);
    expect(filter).toContain('drawtext=');
    expect(filter).toContain('box=1');
    expect(filter).toContain('borderw=2');
    expect(filter).toContain('Roboto-Bold.ttf');
    expect(filter).toContain('Hello\\:world');
  });

  it('maps aspect to resolution', () => {
    expect(resolutionForAspect('16:9').width).toBe(1920);
  });

  it('recognizes encode presets and cancelled error code', () => {
    expect(isFfmpegEncodePreset('ultrafast')).toBe(true);
    expect(isFfmpegEncodePreset('medium')).toBe(false);
    const err = new StudioExportError('studio.export_errors.cancelled');
    expect(err.code).toBe('studio.export_errors.cancelled');
  });

  it('resolves Roboto font files for Inter/Roboto families', () => {
    expect(resolveStudioFontFile('Roboto', true).ffmpegFileName).toBe(
      'Roboto-Bold.ttf',
    );
    expect(resolveStudioFontFile('Inter', false).ffmpegFileName).toBe(
      'Roboto-Regular.ttf',
    );
  });

  it('parses numeric CSS filters for FFmpeg', () => {
    expect(cssFilterToFfmpeg('brightness(1.2) contrast(1.5)')).toContain('eq=');
    expect(cssFilterToFfmpeg('blur(4px)')).toContain('gblur=');
    expect(cssFilterToFfmpeg('hue-rotate(90deg)')).toContain('hue=h=90');
    expect(cssFilterToFfmpeg('grayscale(1) contrast(1.2)')).toContain(
      'colorchannelmixer',
    );
  });

  it('scales resolution for constrained export', () => {
    const scaled = scaleResolutionForExport(1080, 1920, 720);
    expect(Math.max(scaled.width, scaled.height)).toBeLessThanOrEqual(720);
    expect(scaled.width % 2).toBe(0);
    expect(scaled.height % 2).toBe(0);
  });
});
