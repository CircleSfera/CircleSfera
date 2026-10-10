import type { Clip, MediaClip, StudioProject } from '../types/studio';

// Strip non-serializable File handles before persisting to the API.
export function serializeStudioProject(project: StudioProject): StudioProject {
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.type === 'text') return clip;
        const media = clip as MediaClip;
        return { ...media, file: null };
      }),
    })),
    updatedAt: new Date().toISOString(),
  };
}

// First remote media URL suitable for EditProject.mediaUrl (required column).
export function getPrimaryMediaUrl(project: StudioProject): string | null {
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.type === 'text') continue;
      const url = (clip as MediaClip).fileUrl;
      if (url && !url.startsWith('blob:')) return url;
    }
  }
  return null;
}

export function findClip(
  project: StudioProject,
  clipId: string,
): Clip | undefined {
  return project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
}

export function isRemoteMediaUrl(url: string): boolean {
  return Boolean(url) && !url.startsWith('blob:') && !url.startsWith('data:');
}

/** The shortest a project with clips is: room to work on a short timeline. */
export const MIN_TIMELINE_SEC = 5;

/**
 * Where the last clip of a project ends, in seconds; zero with no clips.
 * Clips on hidden tracks are left out when asked: they are not exported.
 */
export function projectContentEnd(
  project: StudioProject,
  options: { visibleOnly?: boolean } = {},
): number {
  return Math.max(
    0,
    ...project.tracks
      .filter((track) => !options.visibleOnly || !track.hidden)
      .flatMap((track) => track.clips.map((c) => c.startAt + c.duration)),
  );
}

/**
 * The project with the length its clips give it. A project with no clips
 * keeps the length it has.
 */
export function withLengthOfClips(project: StudioProject): StudioProject {
  const end = projectContentEnd(project);
  if (end === 0) return project;
  const duration = Math.max(MIN_TIMELINE_SEC, end);
  return duration === project.duration ? project : { ...project, duration };
}
