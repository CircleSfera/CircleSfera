export type MediaType = 'video' | 'image' | 'audio' | 'text' | 'overlay';

export type AspectRatioType = '9:16' | '16:9' | '1:1' | '4:5';

export type StudioTab = 'media' | 'text' | 'audio' | 'filters' | 'subtitles';

export interface BaseClip {
  id: string;
  type: MediaType;
  trackId: string;
  // Timeline timing
  startAt: number; // Start time on the timeline (in seconds)
  duration: number; // Duration on the timeline (in seconds)
}

export interface MediaClip extends BaseClip {
  type: 'video' | 'image' | 'audio';
  fileUrl: string; // Blob URL or remote URL
  file: File | null;

  // Media timing
  mediaStart: number; // Start time within the media file (for trimming)

  // Adjustments
  speed: number;
  volume: number;
  muted: boolean;

  // Visuals
  filter?: string; // CSS filter string
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

export type Clip = MediaClip | TextClip;

export interface Track {
  id: string;
  type: 'video' | 'audio' | 'text';
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
  resolution: {
    width: number;
    height: number;
  };
  createdAt: string;
  updatedAt: string;
}
