/** How many broadcasts the recorder records at once; others go unrecorded. */
export const RECORDINGS_AT_ONCE = 3;

/** The longest recording. The broadcast may go on; its recording stops. */
export const RECORDING_MAX_MS = 4 * 60 * 60 * 1000;

/** How long a recording the host neither published nor deleted is kept. */
export const RECORDING_KEPT_DAYS = 30;

/**
 * A recording upright, as a live is shown: 720 x 1280 at 30 frames a second.
 * A talking head moves little, so 1.5 Mbps keeps it sharp; a key frame every
 * 2 seconds lets the replay be cut into 4-second pieces without re-reading.
 */
export const RECORDING_ENCODING = {
  width: 720,
  height: 1280,
  framerate: 30,
  videoBitrateKbps: 1500,
  audioBitrateKbps: 96,
  keyFrameIntervalSec: 2,
} as const;

/** The recorder's folder, as the recorder itself names it. */
export const RECORDER_FOLDER = '/out';

/** The recorder's file of a broadcast: one per broadcast, by its id. */
export const recordingFileName = (streamId: string): string =>
  `live-${streamId}.mp4`;
