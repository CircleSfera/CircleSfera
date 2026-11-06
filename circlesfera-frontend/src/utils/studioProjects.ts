import type { StudioProject } from '../types/studio';
import { resolutionForAspect } from './studioExportHelpers';
import { emptyTrack, newStudioId } from './studioTimeline';

/** The frames per second of a new project. */
export const STUDIO_FPS = 30;

/**
 * A new, empty project: upright (9:16), with only its main track. Text and
 * sound layers are made when something is put on them.
 */
export function newBlankProject(
  name: string,
  t: (key: string) => string,
): StudioProject {
  const now = new Date().toISOString();
  return {
    id: newStudioId(),
    name,
    duration: 0,
    fps: STUDIO_FPS,
    aspectRatio: '9:16',
    resolution: resolutionForAspect('9:16'),
    tracks: [emptyTrack('video', t('studio.tracks.video'))],
    createdAt: now,
    updatedAt: now,
  };
}
