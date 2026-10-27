import * as path from 'node:path';

/**
 * How many broadcasts the recorder records at once when LIVE_RECORDINGS_AT_ONCE
 * does not say; others go unrecorded.
 */
export const RECORDINGS_AT_ONCE_DEFAULT = 1;

/** The most co-host parts one broadcast's recording keeps. */
export const COHOST_PARTS_MAX = 20;

/** The longest recording. The broadcast may go on; its recording stops. */
export const RECORDING_MAX_MS = 4 * 60 * 60 * 1000;

/**
 * One person's camera, upright, as a live is shown: 720 x 1280 at 30 frames a
 * second; a camera of another shape is fitted inside. A talking head moves
 * little, so 1.5 Mbps keeps it sharp; a key frame every 2 seconds lets the
 * replay be cut into 4-second pieces.
 */
export const RECORDING_ENCODING = {
  width: 720,
  height: 1280,
  framerate: 30,
  videoBitrateKbps: 1500,
  audioBitrateKbps: 96,
  keyFrameIntervalSec: 2,
} as const;

/** How long a recording the host neither published nor deleted is kept. */
export const RECORDING_KEPT_DAYS = 30;

/** The recorder's folder, as the recorder itself names it. */
export const RECORDER_FOLDER = '/out';

/**
 * The same folder, as this server reads it: LIVE_RECORDINGS_DIR, or
 * recordings/ beside uploads/.
 */
export const recordingsFolder = (): string =>
  process.env.LIVE_RECORDINGS_DIR || path.join(process.cwd(), 'recordings');

/** The recorder's file of a broadcast's host. */
export const hostFileName = (streamId: string): string =>
  `live-${streamId}-host.mp4`;

/** The recorder's file of a co-host's n-th time on air, counted from 1. */
export const coHostFileName = (streamId: string, n: number): string =>
  `live-${streamId}-cohost-${n}.mp4`;
