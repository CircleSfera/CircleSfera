import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/test-utils';
import StoryCapture from './StoryCapture';

/** A camera track, with a light when asked for. */
function cameraTrack(torch = false) {
  return {
    kind: 'video',
    stop: vi.fn(),
    getCapabilities: () => ({ torch }),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  };
}

function stream(tracks: ReturnType<typeof cameraTrack>[]) {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  };
}

const getUserMedia = vi.fn();
const recorders: FakeRecorder[] = [];

class FakeRecorder {
  static isTypeSupported = (type: string) => type === 'video/webm';
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  stream: unknown;
  options: { mimeType: string };
  constructor(stream: unknown, options: { mimeType: string }) {
    this.stream = stream;
    this.options = options;
    recorders.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({
      data: new Blob(['video'], { type: 'video/webm' }),
    });
    this.onstop?.();
  }
}

function show() {
  const props = {
    onCapture: vi.fn(),
    onOpenGallery: vi.fn(),
    onCreate: vi.fn(),
    onClose: vi.fn(),
  };
  renderWithProviders(<StoryCapture {...props} />, { lng: 'es' });
  return props;
}

const shutter = () =>
  screen.getByRole('button', {
    name: 'Hacer una foto, o mantener para grabar un vídeo',
  });

describe('StoryCapture', () => {
  beforeEach(() => {
    recorders.length = 0;
    getUserMedia.mockReset();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal(
      'MediaStream',
      class {
        tracks: unknown[];
        constructor(tracks: unknown[]) {
          this.tracks = tracks;
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the back camera with its controls once it is on, and asks for no microphone', async () => {
    getUserMedia.mockResolvedValue(stream([cameraTrack()]));
    show();

    await waitFor(() => expect(shutter()).toBeInTheDocument());
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({
      video: { facingMode: 'environment' },
      audio: false,
    });
    for (const name of [
      'Cerrar la cámara',
      'Elegir de la galería',
      'Cambiar de cámara',
      'Crear Historia de Texto',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    // No light on this camera: no button for it.
    expect(
      screen.queryByRole('button', { name: 'Encender la luz' }),
    ).not.toBeInTheDocument();
  });

  it('switches to the front camera, and stops the one it leaves', async () => {
    const back = cameraTrack();
    getUserMedia
      .mockResolvedValueOnce(stream([back]))
      .mockResolvedValueOnce(stream([cameraTrack()]));
    show();
    await waitFor(() => expect(shutter()).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar de cámara' }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(getUserMedia.mock.calls[1][0].video.facingMode).toBe('user');
    expect(back.stop).toHaveBeenCalled();
  });

  it('switches the light on and off where the camera has one', async () => {
    const track = cameraTrack(true);
    getUserMedia.mockResolvedValue(stream([track]));
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Encender la luz' }),
    );

    await waitFor(() =>
      expect(track.applyConstraints).toHaveBeenCalledWith({
        advanced: [{ torch: true }],
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Apagar la luz' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('records while the shutter is held, asking for the microphone then, and hands the video over', async () => {
    const sound = { ...cameraTrack(), kind: 'audio' };
    getUserMedia
      .mockResolvedValueOnce(stream([cameraTrack()]))
      .mockResolvedValueOnce(stream([sound]));
    const { onCapture } = show();
    await waitFor(() => expect(shutter()).toBeInTheDocument());
    vi.useFakeTimers();

    fireEvent.pointerDown(shutter(), { pointerId: 1 });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await act(async () => {});
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: true });
    expect(recorders).toHaveLength(1);
    expect(recorders[0].options.mimeType).toBe('video/webm');
    expect(screen.getByTestId('story-capture-progress')).toBeInTheDocument();

    fireEvent.pointerUp(screen.getByRole('button', { name: 'Grabando' }));

    const [[file]] = onCapture.mock.calls;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('video/webm');
    expect(sound.stop).toHaveBeenCalled();
  });

  it('stops a video at the longest a story takes', async () => {
    getUserMedia
      .mockResolvedValueOnce(stream([cameraTrack()]))
      .mockRejectedValueOnce(new Error('no microphone'));
    const { onCapture } = show();
    await waitFor(() => expect(shutter()).toBeInTheDocument());
    vi.useFakeTimers();

    fireEvent.pointerDown(shutter(), { pointerId: 1 });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await act(async () => {});
    expect(recorders).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it('offers the gallery and a text story when the camera is refused', async () => {
    getUserMedia.mockRejectedValue(
      Object.assign(new Error('no'), { name: 'NotAllowedError' }),
    );
    const props = show();

    expect(
      await screen.findByText(/La cámara no está permitida/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hacer una foto/ })).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Elegir de la galería' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Crear Historia de Texto' }),
    );
    expect(props.onOpenGallery).toHaveBeenCalled();
    expect(props.onCreate).toHaveBeenCalled();
  });

  it('says there is no camera when the device has none', async () => {
    getUserMedia.mockRejectedValue(
      Object.assign(new Error('none'), { name: 'NotFoundError' }),
    );
    show();

    expect(
      await screen.findByText('Aquí no hay una cámara que usar.'),
    ).toBeInTheDocument();
  });

  it('stops the camera while the page is hidden, and starts it again after', async () => {
    const track = cameraTrack();
    getUserMedia.mockResolvedValue(stream([track]));
    show();
    await waitFor(() => expect(shutter()).toBeInTheDocument());

    Object.defineProperty(document, 'hidden', {
      value: true,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(track.stop).toHaveBeenCalled();

    Object.defineProperty(document, 'hidden', {
      value: false,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  });
});
