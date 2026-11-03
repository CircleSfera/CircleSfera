import type { FrameLook } from '@circlesfera/shared';
import {
  FRAME_ASSEMBLY_POLL_MS,
  FRAME_ASSEMBLY_WAIT_MS,
} from '../../constants/frameAssembly';
import { uploadApi } from '../../services/upload.service';
import { sanitizeUrl } from '../../utils/apiUtils';
import type { FrameClip } from './frameClips';

/** Where the putting together of a Frame is, to show it. */
export type FrameAssemblyStep =
  | { kind: 'uploading'; done: number; total: number }
  | { kind: 'assembling' };

export class FrameAssemblyError extends Error {
  readonly reason: 'failed' | 'timeout';
  constructor(reason: 'failed' | 'timeout') {
    super(`The Frame could not be put together (${reason})`);
    this.reason = reason;
  }
}

export interface FrameAssemblyDeps {
  api: Pick<
    typeof uploadApi,
    'upload' | 'uploadFrameClip' | 'assembleFrame' | 'frameAssemblyStatus'
  >;
  fetchFile: (url: string, signal?: AbortSignal) => Promise<Blob>;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
}

const defaultDeps: FrameAssemblyDeps = {
  api: uploadApi,
  fetchFile: async (url, signal) => {
    const response = await fetch(sanitizeUrl(url) ?? url, {
      credentials: 'include',
      signal,
    });
    if (!response.ok) throw new Error(`The Frame could not be read`);
    return response.blob();
  },
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    }),
  now: () => Date.now(),
};

/** What goes over a Frame's clips: the painted layer, its look, its sound. */
export interface FrameFinish {
  layer: Blob | null;
  look?: FrameLook;
  muted?: boolean;
}

function asForm(file: Blob, name: string): FormData {
  const form = new FormData();
  form.append('file', file, name);
  return form;
}

/**
 * Puts a Frame together on the server: its clips are sent one after the
 * other, then what is painted over them, then the server is asked to join
 * them with their look and asked again until the video is ready. Answers the video's
 * address and the video itself, to show and publish as a Frame.
 */
export async function assembleFrame(
  clips: FrameClip[],
  { layer, look, muted }: FrameFinish,
  onStep: (step: FrameAssemblyStep) => void,
  deps: FrameAssemblyDeps = defaultDeps,
  signal?: AbortSignal,
): Promise<{ url: string; file: File }> {
  // Cancelled: no more is sent, waited for or asked. A job the server has
  // already taken runs to its end and its video is left unused.
  const request = { signal };
  const sent = [];
  for (const [index, clip] of clips.entries()) {
    onStep({ kind: 'uploading', done: index, total: clips.length });
    signal?.throwIfAborted();
    const { data } = await deps.api.uploadFrameClip(
      asForm(clip.file, clip.file.name),
      request,
    );
    sent.push({ url: data.url, startMs: clip.startMs, endMs: clip.endMs });
  }
  onStep({ kind: 'uploading', done: clips.length, total: clips.length });
  const layerUrl = layer
    ? (await deps.api.upload(asForm(layer, 'frame-layer.png'), request)).data
        .url
    : undefined;

  onStep({ kind: 'assembling' });
  const {
    data: { id },
  } = await deps.api.assembleFrame(
    {
      clips: sent,
      layerUrl,
      ...(look && Object.keys(look).length > 0 ? { look } : {}),
      ...(muted ? { muted } : {}),
    },
    request,
  );
  const until = deps.now() + FRAME_ASSEMBLY_WAIT_MS;
  for (;;) {
    const { data } = await deps.api.frameAssemblyStatus(id, request);
    if (data.status === 'READY' && data.url) {
      const video = await deps.fetchFile(data.url, signal);
      return {
        url: data.url,
        file: new File([video], 'frame.mp4', { type: 'video/mp4' }),
      };
    }
    if (data.status !== 'PENDING') throw new FrameAssemblyError('failed');
    if (deps.now() >= until) throw new FrameAssemblyError('timeout');
    await deps.sleep(FRAME_ASSEMBLY_POLL_MS, signal);
  }
}
