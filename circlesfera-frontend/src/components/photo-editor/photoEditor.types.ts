import type { OverlayElement } from '../../services/edits.service';
import type { PhotoAdjustments } from './photoEditor.constants';

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface VideoData {
  startTime: number;
  endTime: number;
  muted: boolean;
}

export type PhotoEditorTab = 'FILTERS' | 'ADJUST' | 'CROP' | 'OVERLAY' | 'TRIM';

/** What the editor reports to its owner, and can be opened with again. */
export interface PhotoEditorSavedState {
  /** The classes of the chosen filter, as in `PHOTO_FILTERS`. */
  filter?: string;
  adjustments?: PhotoAdjustments;
  cropData?: CropData | null;
  /** The crop shape chosen; none means the original shape. */
  aspect?: number;
  overlays?: OverlayElement[];
  videoData?: Partial<VideoData>;
}

export type PhotoEditorSave = (
  file: File,
  filter: string,
  cropData?: CropData,
  overlayDataUrl?: string,
  videoData?: VideoData,
  /** Everything chosen, so the editor opens again where it was left. */
  state?: PhotoEditorSavedState,
) => void;
