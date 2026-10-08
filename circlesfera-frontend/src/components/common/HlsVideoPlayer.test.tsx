import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HlsVideoPlayer from './HlsVideoPlayer';

const hls = vi.hoisted(() => {
  const instances: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
  const state = { supported: true, loads: 0 };
  return { instances, state };
});

vi.mock('hls.js', () => {
  hls.state.loads += 1;
  class FakeHls {
    static isSupported = () => hls.state.supported;
    static Events = { ERROR: 'hlsError' };
    static ErrorTypes = {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
    };
    handlers = new Map<string, (event: string, data: unknown) => void>();
    loadSource = vi.fn();
    attachMedia = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();
    destroy = vi.fn();
    on = vi.fn((event: string, handler: (e: string, d: unknown) => void) => {
      this.handlers.set(event, handler);
    });
    options: unknown;
    constructor(options: unknown) {
      this.options = options;
      hls.instances.push(this as never);
    }
  }
  return { default: FakeHls };
});

vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const video = (container: HTMLElement) =>
  container.querySelector('video') as HTMLVideoElement;

describe('HlsVideoPlayer', () => {
  beforeEach(() => {
    hls.instances.length = 0;
    hls.state.supported = true;
    HTMLMediaElement.prototype.load = vi.fn();
  });

  it('plays a plain video without creating a stream', async () => {
    const { container } = render(
      <HlsVideoPlayer src="https://cdn.test/clip.mp4" />,
    );

    expect(video(container).src).toBe('https://cdn.test/clip.mp4');
    await Promise.resolve();
    expect(hls.instances).toHaveLength(0);
    // The streaming library is not even downloaded for a plain video. The
    // count is never reset, so loading it with the component would show here.
    expect(hls.state.loads).toBe(0);
  });

  it('plays a stream through the streaming library and frees it when removed', async () => {
    const { container, unmount } = render(
      <HlsVideoPlayer
        src="https://cdn.test/clip.mp4"
        hlsUrl="https://cdn.test/clip/master.m3u8"
      />,
    );

    await waitFor(() => expect(hls.instances).toHaveLength(1));
    expect(hls.state.loads).toBe(1);
    const stream = hls.instances[0];
    expect(stream.loadSource).toHaveBeenCalledWith(
      'https://cdn.test/clip/master.m3u8',
    );
    expect(stream.attachMedia).toHaveBeenCalledWith(video(container));
    expect((stream as never as { options: unknown }).options).toMatchObject({
      autoStartLoad: true,
    });

    unmount();
    expect(stream.destroy).toHaveBeenCalled();
  });

  it('holds back the download of a stream that is only next in line, then starts it', async () => {
    const props = {
      src: 'https://cdn.test/clip.mp4',
      hlsUrl: 'https://cdn.test/clip/master.m3u8',
    };
    const { rerender } = render(<HlsVideoPlayer {...props} isNext />);

    await waitFor(() => expect(hls.instances).toHaveLength(1));
    expect(
      (hls.instances[0] as never as { options: unknown }).options,
    ).toMatchObject({ autoStartLoad: false });

    rerender(<HlsVideoPlayer {...props} isNext={false} />);

    await waitFor(() => expect(hls.instances).toHaveLength(2));
    expect(
      (hls.instances[1] as never as { options: unknown }).options,
    ).toMatchObject({ autoStartLoad: true });
  });

  it('recovers from stream errors and falls back to the plain video on a fatal one', async () => {
    const { container } = render(
      <HlsVideoPlayer
        src="https://cdn.test/clip.mp4"
        hlsUrl="https://cdn.test/clip/master.m3u8"
      />,
    );
    await waitFor(() => expect(hls.instances).toHaveLength(1));
    const stream = hls.instances[0] as never as {
      handlers: Map<string, (event: string, data: unknown) => void>;
      startLoad: ReturnType<typeof vi.fn>;
      recoverMediaError: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    const fail = (data: unknown) => stream.handlers.get('hlsError')?.('', data);

    fail({ fatal: false, type: 'networkError' });
    expect(stream.startLoad).not.toHaveBeenCalled();

    fail({ fatal: true, type: 'networkError' });
    expect(stream.startLoad).toHaveBeenCalled();

    fail({ fatal: true, type: 'mediaError' });
    expect(stream.recoverMediaError).toHaveBeenCalled();

    fail({ fatal: true, type: 'otherError' });
    expect(stream.destroy).toHaveBeenCalled();
    expect(video(container).src).toBe('https://cdn.test/clip.mp4');
  });

  it('uses the browser own stream support when the library cannot run', async () => {
    hls.state.supported = false;
    HTMLMediaElement.prototype.canPlayType = vi.fn(() => 'maybe') as never;
    const { container } = render(
      <HlsVideoPlayer
        src="https://cdn.test/clip.mp4"
        hlsUrl="https://cdn.test/clip/master.m3u8"
      />,
    );

    await waitFor(() =>
      expect(video(container).src).toBe('https://cdn.test/clip/master.m3u8'),
    );
    expect(hls.instances).toHaveLength(0);
  });

  it('plays the plain video when streams are not supported at all', async () => {
    hls.state.supported = false;
    HTMLMediaElement.prototype.canPlayType = vi.fn(() => '') as never;
    const { container } = render(
      <HlsVideoPlayer
        src="https://cdn.test/clip.mp4"
        hlsUrl="https://cdn.test/clip/master.m3u8"
      />,
    );

    await waitFor(() =>
      expect(video(container).src).toBe('https://cdn.test/clip.mp4'),
    );
  });

  it('ignores a stream address that is not a playlist', async () => {
    const { container } = render(
      <HlsVideoPlayer
        src="https://cdn.test/clip.mp4"
        hlsUrl="https://cdn.test/clip.mov"
      />,
    );

    expect(video(container).src).toBe('https://cdn.test/clip.mp4');
    await Promise.resolve();
    expect(hls.instances).toHaveLength(0);
  });

  it('plays the plain video when the streaming library cannot be downloaded', async () => {
    // A fresh copy of the component, so the library is requested again and
    // this time the download fails.
    vi.resetModules();
    vi.doMock('hls.js', () => {
      throw new Error('chunk failed to load');
    });
    const { default: FreshPlayer } = await import('./HlsVideoPlayer');
    const { container } = render(
      <FreshPlayer
        src="https://cdn.test/clip.mp4"
        hlsUrl="https://cdn.test/clip/master.m3u8"
      />,
    );

    await waitFor(() =>
      expect(video(container).src).toBe('https://cdn.test/clip.mp4'),
    );
    expect(hls.instances).toHaveLength(0);
  });
});
