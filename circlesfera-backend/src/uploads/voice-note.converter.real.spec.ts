import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MediaSignatureValidator } from './media-signature.validator.js';
import { VoiceNoteConverter } from './voice-note.converter.js';

// Real recordings through the real converter program. Skipped where the
// program is not installed; the server image carries it.
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe.skipIf(!hasFfmpeg)('a recorded voice note, converted for real', () => {
  let folder: string;
  const converter = new VoiceNoteConverter();
  const validator = new MediaSignatureValidator();
  const record = (name: string, args: string[]) => {
    const file = path.join(folder, name);
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, file]);
    return fs.readFileSync(file);
  };
  const tone = ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1'];

  beforeAll(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-note-spec-'));
    for (const subject of [converter, validator]) {
      const { logger } = subject as unknown as {
        logger: { warn: () => void; debug: () => void };
      };
      vi.spyOn(logger, 'warn').mockImplementation(() => {});
      vi.spyOn(logger, 'debug').mockImplementation(() => {});
    }
  });

  afterAll(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it.each([
    ['Chrome', 'audio/webm', 'chrome.webm', ['-c:a', 'libopus']],
    [
      'Safari',
      'audio/mp4',
      'safari.mp4',
      ['-c:a', 'aac', '-movflags', '+frag_keyframe+empty_moov'],
    ],
  ])(
    'takes what %s records and stores it as m4a',
    async (_browser, declared, name, codec) => {
      const recording = record(name, [...tone, ...codec]);

      await expect(
        validator.validate(recording, declared),
      ).resolves.toBeUndefined();
      const converted = await converter.toM4a(recording);

      expect(await fileTypeFromBuffer(converted)).toMatchObject({
        mime: 'audio/x-m4a',
      });
    },
  );

  it('refuses a picture-only file declared as a recording', async () => {
    const silentFilm = record('film.webm', [
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=64x64:rate=5',
      '-c:v',
      'libvpx',
    ]);

    await expect(converter.toM4a(silentFilm)).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });
});
