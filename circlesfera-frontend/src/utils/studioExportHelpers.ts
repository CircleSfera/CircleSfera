import type {
  AspectRatioType,
  MediaClip,
  StudioProject,
  TextClip,
} from '../types/studio';

export function resolutionForAspect(aspect: AspectRatioType): {
  width: number;
  height: number;
} {
  switch (aspect) {
    case '16:9':
      return { width: 1920, height: 1080 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    default:
      return { width: 1080, height: 1920 };
  }
}

/**
 * Letterbox (contain) source into destination — matches FFmpeg
 * `scale=…:force_original_aspect_ratio=decrease` + centered overlay.
 */
export function containRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { x: number; y: number; w: number; h: number } {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { x: 0, y: 0, w: dstW, h: dstH };
  }
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  if (srcAspect > dstAspect) {
    const w = dstW;
    const h = dstW / srcAspect;
    return { x: 0, y: (dstH - h) / 2, w, h };
  }
  const h = dstH;
  const w = dstH * srcAspect;
  return { x: (dstW - w) / 2, y: 0, w, h };
}

/** Map CSS filter strings used in Studio to FFmpeg filter fragments. */
export function cssFilterToFfmpeg(cssFilter: string): string {
  if (!cssFilter) return '';
  const parts: string[] = [];

  const grayscale = cssFilter.match(/grayscale\(\s*([\d.]+)\s*\)/i);
  if (grayscale) {
    const g = Math.min(1, Math.max(0, Number(grayscale[1])));
    if (g >= 0.99) {
      parts.push('colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3');
    } else if (g > 0) {
      // Approximate partial grayscale via eq saturation
      parts.push(`eq=saturation=${(1 - g).toFixed(2)}`);
    }
  } else if (cssFilter.includes('grayscale')) {
    parts.push('colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3');
  }

  if (cssFilter.includes('sepia')) {
    parts.push(
      'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
    );
  }

  if (cssFilter.includes('invert')) {
    parts.push('negate');
  }

  const hue = cssFilter.match(/hue-rotate\(\s*(-?[\d.]+)deg\s*\)/i);
  if (hue) {
    parts.push(`hue=h=${Number(hue[1])}:s=1`);
  }

  const brightness = cssFilter.match(/brightness\(\s*([\d.]+)\s*\)/i);
  const contrast = cssFilter.match(/contrast\(\s*([\d.]+)\s*\)/i);
  const saturate = cssFilter.match(/saturate\(\s*([\d.]+)\s*\)/i);
  const eqParts: string[] = [];
  if (brightness) {
    // CSS brightness 1 = no change; FFmpeg eq brightness is -1..1 offset approx
    const b = Number(brightness[1]);
    eqParts.push(`brightness=${(b - 1).toFixed(3)}`);
  }
  if (contrast) eqParts.push(`contrast=${Number(contrast[1]).toFixed(3)}`);
  if (saturate) eqParts.push(`saturation=${Number(saturate[1]).toFixed(3)}`);
  if (eqParts.length) parts.push(`eq=${eqParts.join(':')}`);

  const blur = cssFilter.match(/blur\(\s*([\d.]+)px\s*\)/i);
  if (blur) {
    const sigma = Math.max(0.1, Math.min(20, Number(blur[1]) / 2));
    parts.push(`gblur=sigma=${sigma.toFixed(2)}`);
  }

  return parts.join(',');
}

/** Studio text fonts shipped under /fonts (Roboto Apache 2.0). */
export const STUDIO_DEFAULT_FONT_FAMILY = 'Roboto';

export type StudioFontFace = {
  publicPath: string;
  ffmpegFileName: string;
};

export function resolveStudioFontFile(
  fontFamily?: string,
  bold = true,
): StudioFontFace {
  const family = (fontFamily || STUDIO_DEFAULT_FONT_FAMILY).toLowerCase();
  const useBold = bold && !family.includes('light');
  if (family.includes('roboto') || family.includes('inter') || !fontFamily) {
    return useBold
      ? {
          publicPath: '/fonts/Roboto-Bold.ttf',
          ffmpegFileName: 'Roboto-Bold.ttf',
        }
      : {
          publicPath: '/fonts/Roboto-Regular.ttf',
          ffmpegFileName: 'Roboto-Regular.ttf',
        };
  }
  // Unknown families fall back to Roboto for export parity
  return useBold
    ? {
        publicPath: '/fonts/Roboto-Bold.ttf',
        ffmpegFileName: 'Roboto-Bold.ttf',
      }
    : {
        publicPath: '/fonts/Roboto-Regular.ttf',
        ffmpegFileName: 'Roboto-Regular.ttf',
      };
}

/** CSS font-family string aligned with export whitelist. */
export function resolveStudioCssFontFamily(fontFamily?: string): string {
  const face = resolveStudioFontFile(fontFamily, true);
  if (face.ffmpegFileName.includes('Bold')) {
    return 'Roboto, sans-serif';
  }
  return 'Roboto, sans-serif';
}

export function isConstrainedDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(max-width: 767px)').matches) return true;
  } catch {
    // ignore
  }
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  if (typeof memory === 'number' && memory > 0 && memory <= 4) return true;
  return false;
}

/** Cap long edge for weak devices while preserving aspect ratio. */
export function scaleResolutionForExport(
  width: number,
  height: number,
  maxLongEdge = 720,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxLongEdge) {
    return {
      width: evenDim(width),
      height: evenDim(height),
    };
  }
  const scale = maxLongEdge / long;
  return {
    width: evenDim(Math.round(width * scale)),
    height: evenDim(Math.round(height * scale)),
  };
}

function evenDim(n: number): number {
  const v = Math.max(2, n);
  return v % 2 === 0 ? v : v - 1;
}

export function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

/** Convert #rgb / #rrggbb / rgba() to FFmpeg drawtext color (`0xRRGGBB` or `0xRRGGBB@A`). */
export function cssColorToFfmpeg(color: string): string {
  if (!color || color === 'transparent') return '0x000000@0';
  const hex = color.trim();
  if (hex.startsWith('#')) {
    let h = hex.slice(1);
    if (h.length === 3) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (h.length === 6) return `0x${h}`;
    if (h.length === 8) {
      const rgb = h.slice(0, 6);
      const a = Number.parseInt(h.slice(6, 8), 16) / 255;
      return `0x${rgb}@${a.toFixed(2)}`;
    }
  }
  const rgba = hex.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (rgba) {
    const r = Math.round(Number(rgba[1])).toString(16).padStart(2, '0');
    const g = Math.round(Number(rgba[2])).toString(16).padStart(2, '0');
    const b = Math.round(Number(rgba[3])).toString(16).padStart(2, '0');
    const a = rgba[4] !== undefined ? Number(rgba[4]) : 1;
    return a < 1 ? `0x${r}${g}${b}@${a.toFixed(2)}` : `0x${r}${g}${b}`;
  }
  return color.replace('#', '0x');
}

/**
 * Visual clips from all non-hidden video tracks, track order then startAt
 * (first track = bottom layer — matches preview stacking).
 */
export function visualClipsOnVideoTracks(project: StudioProject): MediaClip[] {
  const result: MediaClip[] = [];
  for (const track of project.tracks) {
    if (track.type !== 'video' || track.hidden) continue;
    const clips = track.clips
      .filter((c): c is MediaClip => c.type === 'video' || c.type === 'image')
      .slice()
      .sort((a, b) => a.startAt - b.startAt);
    result.push(...clips);
  }
  return result;
}

/** @deprecated use visualClipsOnVideoTracks */
export function visualClipsOnVideoTrack(project: StudioProject): MediaClip[] {
  return visualClipsOnVideoTracks(project);
}

export function audioClipsOnTracks(project: StudioProject): MediaClip[] {
  return project.tracks
    .filter((t) => t.type === 'audio' && !t.muted)
    .flatMap((t) => t.clips)
    .filter((c): c is MediaClip => c.type === 'audio')
    .slice()
    .sort((a, b) => a.startAt - b.startAt);
}

export function textClipsOnTracks(project: StudioProject): TextClip[] {
  return project.tracks
    .filter((t) => t.type === 'text' && !t.hidden)
    .flatMap((t) => t.clips)
    .filter((c): c is TextClip => c.type === 'text');
}

/** Collect remote media URLs from a v3 studio project state (for draft cleanup). */
export function collectStudioMediaUrls(state: unknown): string[] {
  if (!state || typeof state !== 'object') return [];
  const version = (state as { version?: number }).version;
  const studio = (state as { studio?: StudioProject }).studio;
  if (version !== 3 || !studio?.tracks) return [];

  const urls = new Set<string>();
  for (const track of studio.tracks) {
    for (const clip of track.clips || []) {
      if (clip.type === 'text') continue;
      const url = (clip as MediaClip).fileUrl;
      if (
        url &&
        !url.startsWith('blob:') &&
        !url.startsWith('data:') &&
        (url.startsWith('http://') ||
          url.startsWith('https://') ||
          url.startsWith('/'))
      ) {
        urls.add(url);
      }
    }
  }
  return [...urls];
}

/** Map Whisper absolute media times onto the timeline clip window. */
export function mapCaptionSegmentsToTimeline(
  segments: { start: number; end: number; text: string }[],
  clip: MediaClip,
): { startAt: number; duration: number; text: string }[] {
  const speed = clip.speed ?? 1;
  const mediaStart = clip.mediaStart ?? 0;
  const mediaEnd = mediaStart + clip.duration * speed;
  const result: { startAt: number; duration: number; text: string }[] = [];

  for (const seg of segments) {
    if (seg.end <= mediaStart || seg.start >= mediaEnd) continue;
    const clippedStart = Math.max(seg.start, mediaStart);
    const clippedEnd = Math.min(seg.end, mediaEnd);
    const duration = (clippedEnd - clippedStart) / speed;
    if (duration < 0.15) continue;
    result.push({
      startAt: clip.startAt + (clippedStart - mediaStart) / speed,
      duration,
      text: seg.text.trim(),
    });
  }
  return result;
}

export type StudioExportErrorCode =
  | 'studio.export_errors.no_clips'
  | 'studio.export_errors.load_failed'
  | 'studio.export_errors.encode_failed'
  | 'studio.export_errors.cancelled';

export type FfmpegEncodePreset = 'ultrafast' | 'veryfast' | 'fast';

export const FFMPEG_ENCODE_PRESETS: FfmpegEncodePreset[] = [
  'ultrafast',
  'veryfast',
  'fast',
];

export function isFfmpegEncodePreset(
  value: string,
): value is FfmpegEncodePreset {
  return (FFMPEG_ENCODE_PRESETS as string[]).includes(value);
}

export class StudioExportError extends Error {
  public readonly code: StudioExportErrorCode;

  constructor(code: StudioExportErrorCode) {
    super(code);
    this.code = code;
    this.name = 'StudioExportError';
  }
}
