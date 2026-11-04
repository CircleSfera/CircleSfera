import type {
  Track,
  TrackProcessor,
  VideoProcessorOptions,
} from 'livekit-client';

/**
 * A person on a live sees their front camera as a mirror, and so does
 * everyone watching and the replay: the picture is turned before it is
 * sent, as a camera app does. The back camera is sent as it is. A camera
 * that does not say which way it looks, as a computer's, is a front one.
 */
export function looksAtThePerson(track: MediaStreamTrack): boolean {
  return track.getSettings?.().facingMode !== 'environment';
}

type Canvas = HTMLCanvasElement & {
  captureStream?: (frameRate?: number) => MediaStream;
};

const FRAME_RATE = 30;

export class MirrorCamera implements TrackProcessor<Track.Kind.Video> {
  name = 'mirror-camera';
  processedTrack?: MediaStreamTrack;
  private source?: HTMLVideoElement;
  private mirrored = true;
  private canvas?: Canvas;
  private frame?: number;

  private readonly doc: Pick<Document, 'createElement'>;
  private readonly schedule: (draw: () => void) => number;
  private readonly cancel: (id: number) => void;

  constructor(
    doc: Pick<Document, 'createElement'> = document,
    schedule: (draw: () => void) => number = (draw) =>
      window.requestAnimationFrame(draw),
    cancel: (id: number) => void = (id) => window.cancelAnimationFrame(id),
  ) {
    this.doc = doc;
    this.schedule = schedule;
    this.cancel = cancel;
  }

  /** A browser that cannot send a drawing as video sends the camera. */
  static supported(doc: Pick<Document, 'createElement'> = document): boolean {
    return (
      typeof (doc.createElement('canvas') as Canvas).captureStream ===
      'function'
    );
  }

  async init(opts: VideoProcessorOptions): Promise<void> {
    this.use(opts);
    const canvas = this.doc.createElement('canvas') as Canvas;
    const settings = opts.track.getSettings?.() ?? {};
    canvas.width = settings.width ?? 0;
    canvas.height = settings.height ?? 0;
    this.canvas = canvas;
    this.processedTrack = canvas
      .captureStream?.(FRAME_RATE)
      .getVideoTracks()[0];
    this.loop();
  }

  // Turning the camera hands over the other one; what is sent stays the same
  // track, so nobody watching sees it end.
  async restart(opts: VideoProcessorOptions): Promise<void> {
    this.use(opts);
  }

  async destroy(): Promise<void> {
    if (this.frame !== undefined) this.cancel(this.frame);
    this.frame = undefined;
    this.processedTrack?.stop();
    this.processedTrack = undefined;
  }

  isMirrored(): boolean {
    return this.mirrored;
  }

  private use(opts: VideoProcessorOptions) {
    this.source = opts.element as HTMLVideoElement | undefined;
    this.mirrored = looksAtThePerson(opts.track);
  }

  private loop = () => {
    this.draw();
    this.frame = this.schedule(this.loop);
  };

  /** One frame: the camera's picture, turned when it looks at the person. */
  draw(): void {
    const canvas = this.canvas;
    const source = this.source;
    const context = canvas?.getContext('2d');
    if (!canvas || !source || !context || !source.videoWidth) return;
    if (canvas.width !== source.videoWidth) canvas.width = source.videoWidth;
    if (canvas.height !== source.videoHeight) {
      canvas.height = source.videoHeight;
    }
    context.setTransform(
      this.mirrored ? -1 : 1,
      0,
      0,
      1,
      this.mirrored ? canvas.width : 0,
      0,
    );
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
}
