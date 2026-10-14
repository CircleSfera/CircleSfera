import * as fs from 'node:fs';
import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The converter program is replaced: what it is asked, and how the service
// takes its answer, is what these tests read.
const run = vi.hoisted(() => ({
  outcome: 'end' as 'end' | 'error' | 'never',
  asked: [] as Array<[string, ...unknown[]]>,
  killed: 0,
}));

vi.mock('fluent-ffmpeg', async () => {
  const fsReal = await vi.importActual<typeof import('node:fs')>('node:fs');
  const ffmpeg = vi.fn((input: string) => {
    const handlers: Record<string, (arg?: unknown) => void> = {};
    const record =
      (name: string) =>
      (...args: unknown[]) => {
        run.asked.push([name, ...args]);
        return command;
      };
    const command: Record<string, unknown> = {
      noVideo: record('noVideo'),
      audioCodec: record('audioCodec'),
      audioChannels: record('audioChannels'),
      audioBitrate: record('audioBitrate'),
      duration: record('duration'),
      outputOptions: record('outputOptions'),
      format: record('format'),
      on: (event: string, handler: (arg?: unknown) => void) => {
        handlers[event] = handler;
        return command;
      },
      kill: () => {
        run.killed += 1;
      },
      save: (output: string) => {
        run.asked.push(['save', input, output]);
        if (run.outcome === 'end') {
          fsReal.writeFileSync(output, 'converted');
          handlers.end?.();
        } else if (run.outcome === 'error') {
          handlers.error?.(new Error('no sound in it'));
        }
        return command;
      },
    };
    return command;
  });
  return { default: ffmpeg };
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
    run.killed = 0;
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
    const asked = Object.fromEntries(
      run.asked.map(([name, ...args]) => [name, args]),
    );
    expect(asked.noVideo).toEqual([]);
    expect(asked.audioCodec).toEqual(['aac']);
    expect(asked.duration).toEqual([MAX_VOICE_NOTE_SECONDS]);
    expect(asked.outputOptions).toEqual([
      ['-map_metadata', '-1', '-movflags', '+faststart'],
    ]);
  });

  it('leaves nothing behind on the disk, converted or not', async () => {
    await converter.toM4a(Buffer.from('a recording'));
    run.outcome = 'error';
    await converter.toM4a(Buffer.from('not a recording')).catch(() => {});

    const folders = run.asked
      .filter(([name]) => name === 'save')
      .map(([, input]) => (input as string).replace(/\/recording$/, ''));
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
    await vi.waitFor(() =>
      expect(run.asked.some(([name]) => name === 'save')).toBe(true),
    );
    await vi.advanceTimersByTimeAsync(60_000);

    await refused;
    expect(run.killed).toBe(1);
  });
});
