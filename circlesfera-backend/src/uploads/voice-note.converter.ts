import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import { Semaphore } from '../common/utils/semaphore.js';

// What a browser declares for a recording of the microphone: Chrome, Firefox
// and Android record webm, Safari records mp4. Both containers also carry
// video, so the content check reads them as video.
const RECORDED_VOICE_TYPES = new Set(['audio/webm', 'audio/mp4']);

export const VOICE_NOTE_MIME = 'audio/x-m4a';
export const MAX_VOICE_NOTE_BYTES = 25 * 1024 * 1024;
export const MAX_VOICE_NOTE_SECONDS = 600;
const CONVERSION_TIMEOUT_SECONDS = 60;

// Turns a recorded voice note into one format every device plays: sound
// only, AAC in an m4a file. Whatever else the upload carried (a picture, a
// second track, its metadata) is left out.
@Injectable()
export class VoiceNoteConverter {
  private readonly logger = new Logger(VoiceNoteConverter.name);
  // Conversions run inside the request: only a couple at a time.
  private readonly semaphore = new Semaphore(2);

  isRecordedVoice(declaredMimetype: string): boolean {
    return RECORDED_VOICE_TYPES.has(declaredMimetype);
  }

  async toM4a(recording: Buffer): Promise<Buffer> {
    if (recording.length > MAX_VOICE_NOTE_BYTES) {
      throw new PayloadTooLargeException('The voice note is too large.');
    }

    const release = await this.semaphore.acquire();
    const workDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'voice-note-'),
    );
    try {
      const input = path.join(workDir, 'recording');
      const output = path.join(workDir, 'voice.m4a');
      await fs.promises.writeFile(input, recording);
      await this.convert(input, output);
      return await fs.promises.readFile(output);
    } catch (error) {
      this.logger.warn(
        `A voice note could not be converted: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnsupportedMediaTypeException(
        'The voice note could not be read as a recording.',
      );
    } finally {
      release();
      await fs.promises
        .rm(workDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  private convert(input: string, output: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let finished = false;
      const command = ffmpeg(input, { timeout: CONVERSION_TIMEOUT_SECONDS });
      const done = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => {
        try {
          command.kill('SIGKILL');
        } catch {
          // Already gone.
        }
        done(new Error('Converting a voice note timed out'));
      }, CONVERSION_TIMEOUT_SECONDS * 1000);
      command
        .noVideo()
        .audioCodec('aac')
        .audioChannels(1)
        .audioBitrate('64k')
        .duration(MAX_VOICE_NOTE_SECONDS)
        .outputOptions(['-map_metadata', '-1', '-movflags', '+faststart'])
        .format('ipod')
        .on('end', () => done())
        .on('error', (err: Error) => done(err))
        .save(output);
    });
  }
}
