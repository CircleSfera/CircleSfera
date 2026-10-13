import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { LiveCameraPreview, useCameraPreview } from './LiveCameraPreview';

const track = () => ({ stop: vi.fn() });

describe('the camera preview before going live', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let tracks: ReturnType<typeof track>[];

  beforeEach(() => {
    tracks = [];
    getUserMedia = vi.fn(async () => {
      const mine = track();
      tracks.push(mine);
      return { getTracks: () => [mine] };
    });
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the picture only, front camera first, and lets the camera go when it leaves', async () => {
    const { result, unmount } = renderHook(() => useCameraPreview());

    await waitFor(() => expect(result.current.state).toBe('on'));
    // No sound is asked for: nothing is recorded or sent from the preview.
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'user' },
      audio: false,
    });

    unmount();
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it('turns to the other camera and lets the first one go', async () => {
    const { result } = renderHook(() => useCameraPreview());
    await waitFor(() => expect(result.current.state).toBe('on'));

    act(() => result.current.turn());

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenLastCalledWith({
        video: { facingMode: 'environment' },
        audio: false,
      }),
    );
    await waitFor(() => expect(tracks[0].stop).toHaveBeenCalled());
    expect(result.current.facing).toBe('environment');
  });

  it('says so when the browser refuses the camera', async () => {
    getUserMedia.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useCameraPreview());

    await waitFor(() => expect(result.current.state).toBe('refused'));
  });

  it('shows the front camera as a mirror, and the reason when there is no picture', () => {
    const ref = { current: null };
    const { rerender } = renderWithProviders(
      <LiveCameraPreview videoRef={ref} state="on" facing="user" />,
    );
    expect(screen.getByTestId('live-preview').className).toContain(
      '-scale-x-100',
    );

    rerender(
      <LiveCameraPreview videoRef={ref} state="refused" facing="environment" />,
    );
    expect(screen.getByTestId('live-preview').className).not.toContain(
      '-scale-x-100',
    );
    expect(
      screen.getByText(/The camera could not be opened/),
    ).toBeInTheDocument();
  });
});
