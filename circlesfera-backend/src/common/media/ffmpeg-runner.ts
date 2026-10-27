import { spawn } from 'node:child_process';

// Runs the ffmpeg and ffprobe programs installed on the machine. Each call
// starts the program with a list of arguments and no shell, so nothing in a
// file name or an address is ever read as a command.

/** The lines of what the program wrote to stderr kept to explain a failure. */
const STDERR_TAIL_LINES = 100;
/** Above this, only the end of stderr is kept while the program runs. */
const STDERR_KEEP_CHARS = 64 * 1024;

export interface FfmpegRunOptions {
  /** Aborting it kills the program at once and rejects with its reason. */
  signal?: AbortSignal;
}

/** What ffprobe reports of a file, as JSON. */
export interface FfprobeData {
  format?: { duration?: string; [key: string]: unknown };
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
    [key: string]: unknown;
  }>;
}

/** FFMPEG_PATH names the program when set; otherwise it is found on PATH. */
function ffmpegBinary(): string {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

/** FFPROBE_PATH names the program when set; otherwise it is found on PATH. */
function ffprobeBinary(): string {
  return process.env.FFPROBE_PATH || 'ffprobe';
}

/**
 * The end of what the program wrote to stderr: its last lines, from the last
 * one that is not indented or a "[component]" line on. That is the program's
 * own explanation of why it stopped.
 */
export function stderrTail(stderr: string): string {
  const lines = stderr.split(/\r\n|\r|\n/).slice(-STDERR_TAIL_LINES);
  const message: string[] = [];
  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('[')) {
      message.length = 0;
    } else {
      message.push(line);
    }
  }
  return message.join('\n');
}

interface RunResult {
  stdout: string;
}

function run(
  name: 'ffmpeg' | 'ffprobe',
  binary: string,
  args: readonly string[],
  captureStdout: boolean,
  signal: AbortSignal | undefined,
): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const child = spawn(binary, [...args], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe'],
    });

    let settled = false;
    let stdout = '';
    let stderr = '';

    const settle = (error: unknown, result?: RunResult) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (result) resolve(result);
      else reject(error);
    };

    function onAbort() {
      try {
        child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
      settle(signal?.reason);
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      if (stderr.length > STDERR_KEEP_CHARS * 2) {
        stderr = stderr.slice(-STDERR_KEEP_CHARS);
      }
    });

    // The program could not be started at all, e.g. it is not installed.
    child.on('error', (error) => settle(error));

    // Fired once the program has exited and its output is all read.
    child.on('close', (code: number | null, killedBy: string | null) => {
      if (killedBy) {
        settle(new Error(`${name} was killed with signal ${killedBy}`));
      } else if (code) {
        settle(
          new Error(`${name} exited with code ${code}: ${stderrTail(stderr)}`),
        );
      } else {
        settle(undefined, { stdout });
      }
    });
  });
}

/**
 * Runs ffmpeg with exactly these arguments. Resolves once it exits with 0;
 * rejects with "ffmpeg exited with code N: <end of stderr>" otherwise.
 */
export async function runFfmpeg(
  args: readonly string[],
  options: FfmpegRunOptions = {},
): Promise<void> {
  await run('ffmpeg', ffmpegBinary(), args, false, options.signal);
}

/** Reads what a file or address holds: its format and its streams. */
export async function ffprobe(
  input: string,
  options: FfmpegRunOptions = {},
): Promise<FfprobeData> {
  const { stdout } = await run(
    'ffprobe',
    ffprobeBinary(),
    [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      input,
    ],
    true,
    options.signal,
  );
  return JSON.parse(stdout) as FfprobeData;
}

/**
 * Runs `work` with a signal that is aborted after `ms`. When the time is up
 * the answer is a rejection with `message` at once, and a program started
 * with that signal is killed; whatever `work` does later changes nothing.
 */
export function withTimeout<T>(
  ms: number,
  message: string,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(message);
      reject(error);
      controller.abort(error);
    }, ms);
    work(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * The arguments that write one image of a video at a moment, `width` pixels
 * wide with the height that keeps its shape (rounded to an even number).
 */
export function screenshotArgs(
  input: string,
  atSec: number,
  width: number,
  file: string,
): string[] {
  return [
    '-ss',
    String(atSec),
    '-i',
    input,
    '-y',
    '-filter_complex',
    `scale=w=${width}:h=trunc(ow/a/2)*2[size0];[size0]split=1[screen0]`,
    '-vframes',
    '1',
    '-map',
    '[screen0]',
    file,
  ];
}

/**
 * The moment at `percent` of a video's length, in seconds. The length is the
 * one of its largest video stream, or the file's when that stream has none.
 */
export function momentAtPercent(data: FfprobeData, percent: number): number {
  const largest = (data.streams ?? []).reduce<{
    width: number;
    height: number;
    duration?: string;
  }>(
    (biggest, stream) =>
      stream.codec_type === 'video' &&
      Number(stream.width) * Number(stream.height) >
        biggest.width * biggest.height
        ? {
            width: Number(stream.width),
            height: Number(stream.height),
            duration: stream.duration,
          }
        : biggest,
    { width: 0, height: 0 },
  );
  if (largest.width === 0) {
    throw new Error('No video stream in input, cannot take screenshots');
  }
  let duration = Number(largest.duration);
  if (Number.isNaN(duration)) {
    duration = Number(data.format?.duration);
  }
  if (Number.isNaN(duration)) {
    throw new Error(
      'Could not get input duration, please specify fixed timemarks',
    );
  }
  return (duration * percent) / 100;
}
