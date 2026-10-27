import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A started program: its output streams, how it was started, and kill. */
class FakeChild extends EventEmitter {
  stdout: (EventEmitter & { setEncoding: () => void }) | null = Object.assign(
    new EventEmitter(),
    { setEncoding: vi.fn() },
  );
  stderr: (EventEmitter & { setEncoding: () => void }) | null = Object.assign(
    new EventEmitter(),
    { setEncoding: vi.fn() },
  );
  kill = vi.fn();
}

const started = vi.hoisted(() => ({
  children: [] as Array<{
    binary: string;
    args: string[];
    options: Record<string, unknown>;
    child: FakeChild;
  }>,
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(
    (binary: string, args: string[], options: Record<string, unknown>) => {
      const child = new FakeChild();
      started.children.push({ binary, args, options, child });
      return child;
    },
  ),
}));

import {
  ffprobe,
  momentAtPercent,
  runFfmpeg,
  screenshotArgs,
  stderrTail,
  withTimeout,
} from './ffmpeg-runner.js';

const last = () => {
  const found = started.children.at(-1);
  if (!found) throw new Error('nothing was started');
  return found;
};

describe('ffmpeg runner', () => {
  const env = { ...process.env };

  beforeEach(() => {
    started.children = [];
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;
  });

  afterEach(() => {
    process.env = { ...env };
    vi.useRealTimers();
  });

  describe('runFfmpeg', () => {
    it('starts ffmpeg with exactly the arguments given, with no shell and no input', async () => {
      const running = runFfmpeg(['-i', 'in; rm -rf /', '-y', 'out $(x).mp4']);
      const { binary, args, options, child } = last();

      expect(binary).toBe('ffmpeg');
      expect(args).toEqual(['-i', 'in; rm -rf /', '-y', 'out $(x).mp4']);
      expect(options).toEqual({
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      child.emit('close', 0, null);
      await expect(running).resolves.toBeUndefined();
    });

    it('starts the program FFMPEG_PATH names when it is set', async () => {
      process.env.FFMPEG_PATH = '/opt/ffmpeg/bin/ffmpeg';
      const running = runFfmpeg(['-version']);

      expect(last().binary).toBe('/opt/ffmpeg/bin/ffmpeg');
      last().child.emit('close', 0, null);
      await running;
    });

    it('rejects with the code and the program’s own explanation on a failed exit', async () => {
      const running = runFfmpeg(['-i', 'missing.mp4']);
      const { child } = last();

      child.stderr?.emit(
        'data',
        'ffmpeg version 8\n  built with clang\n[in#0 @ 0x1] Error opening\n',
      );
      child.stderr?.emit(
        'data',
        'Error opening input file missing.mp4.\nError opening input files: No such file or directory\n',
      );
      child.emit('close', 254, null);

      await expect(running).rejects.toThrow(
        'ffmpeg exited with code 254: Error opening input file missing.mp4.\nError opening input files: No such file or directory\n',
      );
    });

    it('rejects when the program was ended by a signal', async () => {
      const running = runFfmpeg([]);
      last().child.emit('close', null, 'SIGTERM');

      await expect(running).rejects.toThrow(
        'ffmpeg was killed with signal SIGTERM',
      );
    });

    it('rejects with the start error when the program cannot be started', async () => {
      const running = runFfmpeg([]);
      const notInstalled = new Error('spawn ffmpeg ENOENT');
      last().child.emit('error', notInstalled);
      // A close after the error changes nothing.
      last().child.emit('close', -2, null);

      await expect(running).rejects.toBe(notInstalled);
    });

    it('keeps only the end of a long stderr', async () => {
      const running = runFfmpeg([]);
      const { child } = last();
      // Far more than is kept, then the explanation.
      for (let i = 0; i < 20; i += 1) {
        child.stderr?.emit('data', `${'x'.repeat(10_000)}\r`);
      }
      child.stderr?.emit('data', '\nConversion failed!\n');
      child.emit('close', 1, null);

      const error = await running.catch((e: Error) => e);
      expect((error as Error).message.length).toBeLessThan(140 * 1024);
      expect((error as Error).message).toMatch(/Conversion failed!\n$/);
    });

    it('kills the program at once and rejects with the reason when aborted', async () => {
      const controller = new AbortController();
      const running = runFfmpeg(['-i', 'a.mp4'], {
        signal: controller.signal,
      });
      const { child } = last();
      const reason = new Error('time is up');

      controller.abort(reason);

      await expect(running).rejects.toBe(reason);
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      // Its exit after that changes nothing.
      child.emit('close', null, 'SIGKILL');
    });

    it('rejects when aborted even if the program is already gone', async () => {
      const controller = new AbortController();
      const running = runFfmpeg([], { signal: controller.signal });
      last().child.kill.mockImplementation(() => {
        throw new Error('no such process');
      });
      const reason = new Error('time is up');

      controller.abort(reason);

      await expect(running).rejects.toBe(reason);
    });

    it('starts nothing when the signal is already aborted', async () => {
      const reason = new Error('too late');

      await expect(
        runFfmpeg([], { signal: AbortSignal.abort(reason) }),
      ).rejects.toBe(reason);
      expect(started.children).toHaveLength(0);
    });

    it('works with a program that has no output streams', async () => {
      const running = runFfmpeg([]);
      const { child } = last();
      child.stdout = null;
      child.stderr = null;
      child.emit('close', 0, null);

      await expect(running).resolves.toBeUndefined();
    });
  });

  describe('ffprobe', () => {
    it('asks for the format and the streams as JSON and answers them parsed', async () => {
      const probing = ffprobe('/uploads/a.mp4');
      const { binary, args, options, child } = last();

      expect(binary).toBe('ffprobe');
      expect(args).toEqual([
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        '/uploads/a.mp4',
      ]);
      expect(options).toEqual({
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout?.emit('data', '{"format":{"duration":"2.0');
      child.stdout?.emit('data', '00000"},"streams":[]}');
      child.emit('close', 0, null);

      await expect(probing).resolves.toEqual({
        format: { duration: '2.000000' },
        streams: [],
      });
    });

    it('starts the program FFPROBE_PATH names when it is set', async () => {
      process.env.FFPROBE_PATH = '/opt/ffmpeg/bin/ffprobe';
      const probing = ffprobe('a.mp4');

      expect(last().binary).toBe('/opt/ffmpeg/bin/ffprobe');
      last().child.stdout?.emit('data', '{}');
      last().child.emit('close', 0, null);
      await expect(probing).resolves.toEqual({});
    });

    it('rejects with the end of stderr on a failed exit', async () => {
      const probing = ffprobe('missing.mp4');
      last().child.stderr?.emit(
        'data',
        'missing.mp4: No such file or directory\n',
      );
      last().child.emit('close', 1, null);

      await expect(probing).rejects.toThrow(
        'ffprobe exited with code 1: missing.mp4: No such file or directory\n',
      );
    });

    it('passes the signal on to the program', async () => {
      const controller = new AbortController();
      const probing = ffprobe('a.mp4', { signal: controller.signal });
      const reason = new Error('time is up');

      controller.abort(reason);

      await expect(probing).rejects.toBe(reason);
      expect(last().child.kill).toHaveBeenCalledWith('SIGKILL');
    });
  });

  describe('stderrTail', () => {
    it('keeps the lines after the last indented or "[component]" line', () => {
      expect(stderrTail('a\n  b\nc\n[x] d\ne\nf')).toBe('e\nf');
      expect(stderrTail('only\r\nlines\rhere')).toBe('only\nlines\nhere');
      expect(stderrTail('')).toBe('');
    });

    it('reads only the last hundred lines', () => {
      const lines = Array.from({ length: 150 }, (_, i) => `line ${i}`);
      const tail = stderrTail(lines.join('\n')).split('\n');

      expect(tail).toHaveLength(100);
      expect(tail[0]).toBe('line 50');
    });
  });

  describe('withTimeout', () => {
    it('answers what the work answers in time, and aborts nothing', async () => {
      let seen: AbortSignal | undefined;

      await expect(
        withTimeout(1_000, 'too slow', async (signal) => {
          seen = signal;
          return 42;
        }),
      ).resolves.toBe(42);
      expect(seen?.aborted).toBe(false);
    });

    it('rejects with the work’s error in time', async () => {
      const failure = new Error('broken');

      await expect(
        withTimeout(1_000, 'too slow', async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
    });

    it('rejects with the message at once when the time is up, and aborts the signal with it', async () => {
      vi.useFakeTimers();
      let seen: AbortSignal | undefined;
      let finish: () => void = () => {};

      const running = withTimeout(5_000, 'too slow', (signal) => {
        seen = signal;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      });
      const refused = expect(running).rejects.toThrow('too slow');
      await vi.advanceTimersByTimeAsync(5_000);
      await refused;

      expect(seen?.aborted).toBe(true);
      expect(seen?.reason).toEqual(new Error('too slow'));
      // The work ending later changes nothing.
      finish();
      await expect(running).rejects.toThrow('too slow');
    });
  });

  describe('screenshotArgs', () => {
    it('seeks before the input and writes one frame scaled to the width', () => {
      expect(screenshotArgs('/in/a.mp4', 0.2, 300, '/out/thumb.jpg')).toEqual([
        '-ss',
        '0.2',
        '-i',
        '/in/a.mp4',
        '-y',
        '-filter_complex',
        'scale=w=300:h=trunc(ow/a/2)*2[size0];[size0]split=1[screen0]',
        '-vframes',
        '1',
        '-map',
        '[screen0]',
        '/out/thumb.jpg',
      ]);
    });
  });

  describe('momentAtPercent', () => {
    it('reads the length of the largest video stream', () => {
      expect(
        momentAtPercent(
          {
            format: { duration: '99.000000' },
            streams: [
              { codec_type: 'audio', duration: '50.000000' },
              {
                codec_type: 'video',
                width: 320,
                height: 240,
                duration: '30.000000',
              },
              {
                codec_type: 'video',
                width: 1280,
                height: 720,
                duration: '20.000000',
              },
              {
                codec_type: 'video',
                width: 640,
                height: 360,
                duration: '10.000000',
              },
            ],
          },
          10,
        ),
      ).toBe(2);
    });

    it('falls back to the length of the file when the stream has none', () => {
      expect(
        momentAtPercent(
          {
            format: { duration: '4.000000' },
            streams: [{ codec_type: 'video', width: 2, height: 2 }],
          },
          10,
        ),
      ).toBeCloseTo(0.4);
    });

    it('refuses a file with no video stream', () => {
      expect(() =>
        momentAtPercent(
          { format: { duration: '4' }, streams: [{ codec_type: 'audio' }] },
          10,
        ),
      ).toThrow('No video stream in input, cannot take screenshots');
      expect(() => momentAtPercent({}, 10)).toThrow(
        'No video stream in input, cannot take screenshots',
      );
    });

    it('refuses a video whose length is not known', () => {
      expect(() =>
        momentAtPercent(
          {
            format: { duration: 'N/A' },
            streams: [{ codec_type: 'video', width: 2, height: 2 }],
          },
          10,
        ),
      ).toThrow('Could not get input duration, please specify fixed timemarks');
    });
  });
});
