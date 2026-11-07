export type MediaType =
  | 'video'
  | 'image'
  | 'audio'
  | 'text'
  | 'overlay'
  | 'effect';

export type AspectRatioType = '9:16' | '16:9' | '1:1' | '4:5';

export type StudioTab =
  | 'media'
  | 'text'
  | 'audio'
  | 'voice'
  | 'filters'
  | 'effects'
  | 'subtitles';

/**
 * What the panel of the editor shows: a tool of the project, a tool of the
 * selected clip, or the settings of the project.
 */
export type StudioPanel =
  | StudioTab
  | 'speed'
  | 'volume'
  | 'fades'
  | 'adjust'
  | 'color'
  | 'effect'
  | 'transition'
  | 'blend'
  | 'chroma'
  | 'settings';

export interface BaseClip {
  id: string;
  type: MediaType;
  trackId: string;
  // Timeline timing
  startAt: number; // Start time on the timeline (in seconds)
  duration: number; // Duration on the timeline (in seconds)
  /** Values a property takes at moments of the clip, eased between. */
  keyframes?: Keyframes;
}

/** The properties keyframes can animate. */
export type KeyProp =
  | 'x'
  | 'y'
  | 'scale'
  | 'rotation'
  | 'opacity'
  | 'volume'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'warmth'
  | 'exposure'
  | 'sharpness'
  | 'filter';

/** A value at a moment, in seconds from the clip's start. */
export interface Keyframe {
  t: number;
  v: number;
}

export type Keyframes = Partial<Record<KeyProp, Keyframe[]>>;

export interface MediaClip extends BaseClip {
  type: 'video' | 'image' | 'audio';
  fileUrl: string; // Blob URL or remote URL
  file: File | null;

  // Media timing
  mediaStart: number; // Start time within the media file (for trimming)
  /** How long the file is, in seconds, when known: a clip cannot take more. */
  sourceDuration?: number;
  /** Seconds over which its sound rises at its start and falls at its end. */
  fadeIn?: number;
  fadeOut?: number;
  /** What the clip is called on the timeline: a song's title, a file's name. */
  label?: string;
  /** The song of the audio library it is, if it is one. */
  audioId?: string;
  /** The video clip whose sound this is, when it was taken out of it. */
  detachedFrom?: string;

  // Adjustments
  speed: number;
  volume: number;
  muted: boolean;

  // Visuals
  filter?: string; // CSS filter string
  /** How much of its colour filter shows, 0 to 100; all of it when unset. */
  filterIntensity?: number;
  /** Brightness, contrast and the rest, each from -100 to 100. */
  color?: ColorAdjustments;
  /** On a clip of the main video track: how it passes to the next one. */
  transitionOut?: ClipTransition;
  /** On a layer: how it mixes with what is under it. */
  blend?: BlendMode;
  /** On a layer: the shape it is cut to. */
  shape?: ClipShape;
  /** On a layer: the colour taken out of it, as a green screen. */
  chroma?: ChromaKey;
  opacity?: number; // 0 to 1
  flipX?: boolean;
  flipY?: boolean;
  transform: {
    scale: number;
    rotation: number;
    x: number;
    y: number;
  };
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  padding?: number;
  borderRadius?: number;
  textAlign: 'left' | 'center' | 'right';
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  opacity?: number;
}

export interface TextClip extends BaseClip {
  type: 'text';
  content: string;
  style: TextStyle;
  transform: {
    scale: number;
    rotation: number;
    x: number;
    y: number;
  };
}

export type BlendMode =
  | 'normal'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'lighten'
  | 'darken';

export type ClipShape = 'none' | 'circle' | 'rounded' | 'heart';

/** A colour taken out of a clip, and how much around it. */
export interface ChromaKey {
  /** #rrggbb */
  color: string;
  /** 0 to 100: how far from the colour is still taken out. */
  strength: number;
  /** 0 to 100: how softly the edge fades. */
  softness: number;
}

/** The picture adjustments of a clip, each from -100 to 100, 0 being none. */
export interface ColorAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  exposure: number;
  sharpness: number;
}

export type TransitionKind =
  | 'crossfade'
  | 'fadeblack'
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'slidedown'
  | 'zoomin'
  | 'blur';

/** How a clip passes to the next: the two overlap for its length. */
export interface ClipTransition {
  kind: TransitionKind;
  /** Seconds. */
  duration: number;
}

export type EffectKind =
  | 'blur'
  | 'vignette'
  | 'grain'
  | 'shake'
  | 'slowzoom'
  | 'mono'
  | 'glow'
  | 'rgbsplit';

/** An effect on the effects layer: it changes the picture for its stretch. */
export interface EffectClip extends BaseClip {
  type: 'effect';
  effect: EffectKind;
  /** 0 to 100. */
  intensity: number;
}

export type Clip = MediaClip | TextClip | EffectClip;

export interface Track {
  id: string;
  /** A voice layer holds recordings; other sound goes under it. */
  type: 'video' | 'audio' | 'voice' | 'text' | 'effect';
  name: string;
  clips: Clip[];
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export interface StudioProject {
  id: string;
  name: string;
  tracks: Track[];
  duration: number; // Total duration of the project
  fps: number;
  aspectRatio: AspectRatioType;
  /** Whether other sound drops while a voice speaks; on unless false. */
  duckUnderVoice?: boolean;
  resolution: {
    width: number;
    height: number;
  };
  createdAt: string;
  updatedAt: string;
}
