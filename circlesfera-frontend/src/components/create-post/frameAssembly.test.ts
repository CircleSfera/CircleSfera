import { describe, expect, it, vi } from 'vitest';
import {
  FRAME_ASSEMBLY_POLL_MS,
  FRAME_ASSEMBLY_WAIT_MS,
} from '../../constants/frameAssembly';
import {
  assembleFrame,
  type FrameAssemblyDeps,
  FrameAssemblyError,
  type FrameAssemblyStep,
} from './frameAssembly';
import type { FrameClip } from './frameClips';

const clip = (name: string, startMs: number, endMs: number): FrameClip => ({
  file: new File([name], `${name}.webm`, { type: 'video/webm' }),
  ms: endMs + 1000,
  startMs,
  endMs,
});

function deps(statuses: Array<{ status: string; url?: string }>) {
  let clock = 0;
  const sent: string[] = [];
  const d = {
    api: {
      uploadFrameClip: vi.fn(async (form: FormData) => {
        const file = form.get('file') as File;
        sent.push(file.name);
        return { data: { url: `/uploads/${file.name}`, type: 'video' } };
      }),
      upload: vi.fn(async () => ({
        data: { url: '/uploads/layer.png', type: 'image' },
      })),
      assembleFrame: vi.fn(async () => ({ data: { id: 'job-1' } })),
      frameAssemblyStatus: vi.fn(async () => ({
        data: statuses.shift() ?? { status: 'PENDING' },
      })),
    },
    fetchFile: vi.fn(async () => new Blob(['video'], { type: 'video/mp4' })),
    sleep: vi.fn(async (ms: number) => {
      clock += ms;
    }),
    now: () => clock,
  };
  return { d: d as unknown as FrameAssemblyDeps & typeof d, sent };
}

describe('putting a Frame together on the server', () => {
  it('sends the clips in their order, then the layer, and waits for the video', async () => {
    const { d, sent } = deps([
      { status: 'PENDING' },
      { status: 'READY', url: '/uploads/frame.mp4' },
    ]);
    const steps: FrameAssemblyStep[] = [];

    const frame = await assembleFrame(
      [clip('b', 0, 9000), clip('a', 1000, 8000)],
      new Blob(['layer'], { type: 'image/png' }),
      (step) => steps.push(step),
      d,
    );

    expect(sent).toEqual(['b.webm', 'a.webm']);
    expect(d.api.assembleFrame).toHaveBeenCalledWith({
      clips: [
        { url: '/uploads/b.webm', startMs: 0, endMs: 9000 },
        { url: '/uploads/a.webm', startMs: 1000, endMs: 8000 },
      ],
      layerUrl: '/uploads/layer.png',
    });
    expect(d.api.frameAssemblyStatus).toHaveBeenCalledWith('job-1');
    expect(d.sleep).toHaveBeenCalledWith(FRAME_ASSEMBLY_POLL_MS);
    expect(d.fetchFile).toHaveBeenCalledWith('/uploads/frame.mp4');
    expect(frame.url).toBe('/uploads/frame.mp4');
    expect(frame.file.type).toBe('video/mp4');
    expect(steps).toEqual([
      { kind: 'uploading', done: 0, total: 2 },
      { kind: 'uploading', done: 1, total: 2 },
      { kind: 'uploading', done: 2, total: 2 },
      { kind: 'assembling' },
    ]);
  });

  it('sends no layer when nothing is painted', async () => {
    const { d } = deps([{ status: 'READY', url: '/uploads/frame.mp4' }]);

    await assembleFrame([clip('a', 0, 20_000)], null, () => {}, d);

    expect(d.api.upload).not.toHaveBeenCalled();
    expect(d.api.assembleFrame).toHaveBeenCalledWith({
      clips: [{ url: '/uploads/a.webm', startMs: 0, endMs: 20_000 }],
      layerUrl: undefined,
    });
  });

  it('fails when the server could not put it together', async () => {
    const { d } = deps([{ status: 'FAILED' }]);

    await expect(
      assembleFrame([clip('a', 0, 20_000)], null, () => {}, d),
    ).rejects.toMatchObject({ reason: 'failed' });
  });

  it('gives up once it has waited as long as the server may take', async () => {
    const { d } = deps([]);

    const waiting = assembleFrame([clip('a', 0, 20_000)], null, () => {}, d);

    await expect(waiting).rejects.toBeInstanceOf(FrameAssemblyError);
    await expect(waiting).rejects.toMatchObject({ reason: 'timeout' });
    expect(d.sleep).toHaveBeenCalledTimes(
      FRAME_ASSEMBLY_WAIT_MS / FRAME_ASSEMBLY_POLL_MS,
    );
  });
});
