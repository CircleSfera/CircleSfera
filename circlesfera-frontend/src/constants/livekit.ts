/**
 * Where the video of a live travels: the LiveKit server of this environment.
 * It is set when the app is built (`VITE_LIVEKIT_URL`); a build without it
 * is refused by the deploy, so no address is written here.
 */
export const LIVEKIT_URL: string = import.meta.env.VITE_LIVEKIT_URL ?? '';
