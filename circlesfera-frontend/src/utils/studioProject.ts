import type { Clip, MediaClip, StudioProject } from '../types/studio';

/** Strip non-serializable File handles before persisting to the API. */
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

/** First remote media URL suitable for EditProject.mediaUrl (required column). */
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
