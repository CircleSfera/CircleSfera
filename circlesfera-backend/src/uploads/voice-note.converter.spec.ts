import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The converter program is replaced: what it is asked, and how the service
// takes its answer, is what these tests read.
const run = vi.hoisted(() => ({
  outcome: 'end' as 'end' | 'error' | 'never',
  asked: [] as string[][],
  stopped: 0,
}));

vi.mock('../common/media/ffmpeg-runner.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../common/media/ffmpeg-runner.js')>();
  const fsReal = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    runFfmpeg: vi.fn(
      (args: string[], options: { signal?: AbortSignal } = {}) =>
        new Promise<void>((resolve, reject) => {
          run.asked.push(args);
          // Killed when the time is up, as the real runner does.
          options.signal?.addEventListener('abort', () => {
            run.stopped += 1;
            reject(options.signal?.reason);
          });
          if (run.outcome === 'end') {
            fsReal.writeFileSync(args[args.length - 1], 'converted');
            resolve();
          } else if (run.outcome === 'error') {
            reject(new Error('no sound in it'));
          }
        }),
    ),
  };
});

import {
  MAX_VOICE_NOTE_BYTES,
  MAX_VOICE_NOTE_SECONDS,
  VoiceNoteConverter,
} from './voice-note.converter.js';

describe('VoiceNoteConverter', () => {
  let converter: VoiceNoteConverter;

  beforeEach(() => {
    run.outcome = 'end';
    run.asked = [];
    run.stopped = 0;
    converter = new VoiceNoteConverter();
    vi.spyOn(
      (converter as unknown as { logger: { warn: () => void } }).logger,
      'warn',
    ).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('takes what a browser declares for a recording, and nothing else', () => {
    expect(converter.isRecordedVoice('audio/webm')).toBe(true);
    expect(converter.isRecordedVoice('audio/mp4')).toBe(true);
    expect(converter.isRecordedVoice('audio/mpeg')).toBe(false);
    expect(converter.isRecordedVoice('video/webm')).toBe(false);
  });

  it('asks for sound only, with no metadata and a limit of time, and answers the converted file', async () => {
    const converted = await converter.toM4a(Buffer.from('a recording'));

    expect(converted.toString()).toBe('converted');
    // The same arguments the converter started ffmpeg with before.
    expect(run.asked).toHaveLength(1);
    const [args] = run.asked;
    const folder = path.dirname(args[1]);
    expect(path.basename(folder)).toMatch(/^voice-note-/);
    expect(args).toEqual([
      '-i',
      path.join(folder, 'recording'),
      '-y',
      '-acodec',
      'aac',
      '-ac',
      '1',
      '-b:a',
      '64k',
      '-vn',
      '-t',
      String(MAX_VOICE_NOTE_SECONDS),
      '-map_metadata',
      '-1',
      '-movflags',
      '+faststart',
      '-f',
      'ipod',
      path.join(folder, 'voice.m4a'),
    ]);
  });

  it('leaves nothing behind on the disk, converted or not', async () => {
    await converter.toM4a(Buffer.from('a recording'));
    run.outcome = 'error';
    await converter.toM4a(Buffer.from('not a recording')).catch(() => {});

    const folders = run.asked.map((args) => path.dirname(args[1]));
    expect(folders).toHaveLength(2);
    for (const folder of folders) {
      expect(fs.existsSync(folder)).toBe(false);
    }
  });

  it('refuses what cannot be read as a recording', async () => {
    run.outcome = 'error';

    await expect(
      converter.toM4a(Buffer.from('not a recording')),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('refuses a recording over the size of a voice note, without converting it', async () => {
    await expect(
      converter.toM4a(Buffer.alloc(MAX_VOICE_NOTE_BYTES + 1)),
    ).rejects.toThrow(PayloadTooLargeException);
    expect(run.asked).toEqual([]);
  });

  it('stops a conversion that does not end', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    run.outcome = 'never';

    const pending = converter.toM4a(Buffer.from('a recording'));
    const refused = expect(pending).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
    await vi.waitFor(() => expect(run.asked).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(60_000);

    await refused;
    expect(run.stopped).toBe(1);
  });
});
