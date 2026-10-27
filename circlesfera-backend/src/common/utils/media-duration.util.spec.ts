import * as path from 'node:path';
import { BadRequestException, Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ffprobe } from '../media/ffmpeg-runner.js';
import {
  assertVideoUrlDuration,
  PROBE_TIME_LIMIT_MS,
  probeMediaDurationSec,
  resolveMediaInputPath,
} from './media-duration.util.js';

vi.mock('../media/ffmpeg-runner.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media/ffmpeg-runner.js')>()),
  ffprobe: vi.fn(),
}));

const probed = (duration?: string) =>
  vi.mocked(ffprobe).mockResolvedValue({ format: { duration }, streams: [] });

describe('media duration', () => {
  beforeEach(() => {
    vi.mocked(ffprobe).mockReset();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads a local upload from the working folder and an address as it is', () => {
    expect(resolveMediaInputPath('/uploads/a.mp4')).toBe(
      path.join(process.cwd(), '/uploads/a.mp4'),
    );
    expect(resolveMediaInputPath('https://cdn.example.com/a.mp4')).toBe(
      'https://cdn.example.com/a.mp4',
    );
  });

  it('answers the length ffprobe reports for the file, in seconds', async () => {
    probed('12.480000');

    await expect(probeMediaDurationSec('/uploads/a.mp4')).resolves.toBe(12.48);
    expect(ffprobe).toHaveBeenCalledWith(
      path.join(process.cwd(), '/uploads/a.mp4'),
      { signal: expect.any(AbortSignal) },
    );
  });

  it('gives up after its time limit and stops ffprobe', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      vi.mocked(ffprobe).mockImplementation((_input, options) => {
        signal = options?.signal;
        return new Promise(() => {});
      });

      const probe = probeMediaDurationSec('https://slow.example.com/a.mp4');
      const refused = expect(probe).rejects.toThrow('ffprobe_timeout');
      await vi.advanceTimersByTimeAsync(PROBE_TIME_LIMIT_MS);

      await refused;
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['not known', 'N/A'],
    ['missing', undefined],
  ])('refuses a length that is %s', async (_why, duration) => {
    probed(duration);

    await expect(probeMediaDurationSec('/uploads/a.mp4')).rejects.toThrow(
      'ffprobe_no_duration',
    );
  });

  it('refuses when nothing is reported of the format', async () => {
    vi.mocked(ffprobe).mockResolvedValue({});

    await expect(probeMediaDurationSec('/uploads/a.mp4')).rejects.toThrow(
      'ffprobe_no_duration',
    );
  });

  it('passes on a failure of ffprobe', async () => {
    vi.mocked(ffprobe).mockRejectedValue(
      new Error('ffprobe exited with code 1'),
    );

    await expect(probeMediaDurationSec('/uploads/a.mp4')).rejects.toThrow(
      'ffprobe exited with code 1',
    );
  });

  it('accepts a video whose length is in range', async () => {
    probed('10.000000');

    await expect(
      assertVideoUrlDuration('STORY', '/uploads/a.mp4'),
    ).resolves.toBeUndefined();
  });

  it('refuses a video whose length is out of range', async () => {
    probed('100000.000000');

    await expect(
      assertVideoUrlDuration('STORY', '/uploads/a.mp4'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['an error', new Error('ffprobe exited with code 1')],
    ['something else', 'broken'],
  ])(
    'refuses a video whose length cannot be read, on %s',
    async (_what, failure) => {
      vi.mocked(ffprobe).mockRejectedValue(failure);

      await expect(
        assertVideoUrlDuration('STORY', '/uploads/a.mp4'),
      ).rejects.toThrow('MEDIA_DURATION_PROBE_FAILED');
    },
  );
});
