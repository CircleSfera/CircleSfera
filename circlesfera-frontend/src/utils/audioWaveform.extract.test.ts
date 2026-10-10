import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downsamplePeaks,
  extractAudioPeaks,
  seededFallbackPeaks,
} from './audioWaveform';

describe('downsamplePeaks', () => {
  it('gives low, even bars for silence', () => {
    expect(downsamplePeaks(new Float32Array(100), 4)).toEqual([
      0.15, 0.15, 0.15, 0.15,
    ]);
  });

  it('scales to the loudest bar and keeps a floor for quiet parts', () => {
    const samples = [0, 0, 0.5, -0.5, 1, -1, 0.01, 0.01];
    expect(downsamplePeaks(samples, 4)).toEqual([0.08, 0.5, 1, 0.08]);
  });

  it('draws at least one bar', () => {
    expect(downsamplePeaks([0.5], 0)).toEqual([1]);
  });
});

describe('extractAudioPeaks', () => {
  const close = vi.fn(() => Promise.resolve());
  const decodeAudioData = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'AudioContext',
      class {
        decodeAudioData = decodeAudioData;
        close = close;
      },
    );
    decodeAudioData.mockResolvedValue({
      getChannelData: () => new Float32Array([0, 1, 0, 0.5]),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the track without sending the session, and draws its real shape', async () => {
    const result = await extractAudioPeaks('https://cdn.example/t.mp3', {
      barCount: 2,
    });

    expect(fetch).toHaveBeenCalledWith('https://cdn.example/t.mp3', {
      signal: undefined,
      mode: 'cors',
      credentials: 'omit',
    });
    expect(result).toEqual({ peaks: [1, 0.5], fromAudio: true });
    expect(close).toHaveBeenCalled();
  });

  it('draws 64 bars unless told otherwise', async () => {
    decodeAudioData.mockResolvedValue({
      getChannelData: () => new Float32Array(640).fill(0.3),
    });
    const { peaks } = await extractAudioPeaks('https://cdn.example/t.mp3');
    expect(peaks).toHaveLength(64);
  });

  it.each([
    [
      'the server refuses it',
      () =>
        vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as never),
    ],
    [
      'the network fails',
      () => vi.mocked(fetch).mockRejectedValue(new Error('offline')),
    ],
    [
      'the file cannot be decoded',
      () => decodeAudioData.mockRejectedValue(new Error('bad data')),
    ],
  ])(
    'draws a made-up shape, always the same for the track, when %s',
    async (_why, arrange) => {
      arrange();

      const first = await extractAudioPeaks('https://cdn.example/t.mp3', {
        barCount: 8,
        seed: 'track-1',
      });
      const again = await extractAudioPeaks('https://cdn.example/t.mp3', {
        barCount: 8,
        seed: 'track-1',
      });

      expect(first).toEqual({
        peaks: seededFallbackPeaks('track-1', 8),
        fromAudio: false,
      });
      expect(again.peaks).toEqual(first.peaks);
    },
  );

  it('uses the address of the track as the seed when none is given', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const { peaks } = await extractAudioPeaks('https://cdn.example/t.mp3');
    expect(peaks).toEqual(seededFallbackPeaks('https://cdn.example/t.mp3', 64));
  });

  it('closes the audio context even when decoding fails', async () => {
    decodeAudioData.mockRejectedValue(new Error('bad data'));
    await extractAudioPeaks('https://cdn.example/t.mp3');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('fails, with no made-up shape, when the reading was cancelled', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementation(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });

    await expect(
      extractAudioPeaks('https://cdn.example/t.mp3', {
        signal: controller.signal,
      }),
    ).rejects.toThrow('Aborted');
  });

  it('works with the older name of the audio context', async () => {
    const Modern = window.AudioContext;
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', Modern);

    const result = await extractAudioPeaks('https://cdn.example/t.mp3', {
      barCount: 2,
    });

    expect(result.fromAudio).toBe(true);
  });
});
