import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoryCamera } from './useStoryCamera';

const track = () => ({ stop: vi.fn(), getCapabilities: () => ({}) });

// The camera of the capture screens, as the live uses it before going on air.
describe('useStoryCamera', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let tracks: ReturnType<typeof track>[];
  let answer: (() => void) | null;

  beforeEach(() => {
    tracks = [];
    answer = null;
    getUserMedia = vi.fn(async () => {
      const mine = track();
      tracks.push(mine);
      return { getTracks: () => [mine], getVideoTracks: () => [mine] };
    });
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with the camera asked for, upright, picture only', async () => {
    const { result } = renderHook(() =>
      useStoryCamera({ initialFacing: 'user' }),
    );

    await waitFor(() => expect(result.current.state).toBe('on'));
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: 'user',
        width: { ideal: 1080 },
        height: { ideal: 1920 },
      },
      audio: false,
    });
    expect(result.current.facing).toBe('user');
  });

  it('starts with the back camera when none is asked for', async () => {
    const { result } = renderHook(() => useStoryCamera());
    await waitFor(() => expect(result.current.state).toBe('on'));
    expect(result.current.facing).toBe('environment');
  });

  it('turns to the other camera and lets the first one go', async () => {
    const { result } = renderHook(() =>
      useStoryCamera({ initialFacing: 'user' }),
    );
    await waitFor(() => expect(result.current.state).toBe('on'));

    act(() => result.current.switchCamera());

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenLastCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({ facingMode: 'environment' }),
        }),
      ),
    );
    await waitFor(() => expect(tracks[0].stop).toHaveBeenCalled());
  });

  it('lets the camera go on stop and never opens it again', async () => {
    const { result, rerender } = renderHook(() =>
      useStoryCamera({ initialFacing: 'user' }),
    );
    await waitFor(() => expect(result.current.state).toBe('on'));

    act(() => result.current.stop());
    rerender();

    expect(tracks[0].stop).toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('releases a camera that answers after stop', async () => {
    getUserMedia.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => {
            const mine = track();
            tracks.push(mine);
            resolve({ getTracks: () => [mine], getVideoTracks: () => [mine] });
          };
        }),
    );
    const { result } = renderHook(() =>
      useStoryCamera({ initialFacing: 'user' }),
    );

    act(() => result.current.stop());
    await act(async () => answer?.());

    expect(tracks[0].stop).toHaveBeenCalled();
    expect(result.current.state).not.toBe('on');
  });

  it('says so when the camera is refused, or there is none', async () => {
    getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    );
    const refused = renderHook(() => useStoryCamera());
    await waitFor(() => expect(refused.result.current.state).toBe('refused'));
    refused.unmount();

    getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error('none'), { name: 'NotFoundError' }),
    );
    const none = renderHook(() => useStoryCamera());
    await waitFor(() => expect(none.result.current.state).toBe('none'));
  });
});
