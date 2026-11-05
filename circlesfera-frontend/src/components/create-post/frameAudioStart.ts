import type { Audio } from '../../types';

// "Use this audio" opens a new Frame with the song already chosen: the song
// travels in the route's state, and the composer takes it once.
const KEY = 'frameAudio';

export function frameWithAudioRoute(audio: Audio) {
  return { to: '/create?mode=frame', options: { state: { [KEY]: audio } } };
}

export function readFrameAudio(state: unknown): Audio | null {
  const audio = (state as Record<string, unknown> | null)?.[KEY] as
    | Audio
    | undefined;
  return audio?.id && audio.url ? audio : null;
}
