import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { UnrecoverableError } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runFfmpeg } from '../../common/media/ffmpeg-runner.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StoredFilesService } from '../services/stored-files.service.js';
import { LiveReplayMaker, replayArgs } from './live-replay.maker.js';

vi.mock('../../common/media/ffmpeg-runner.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../common/media/ffmpeg-runner.js')
    >();
  return {
    ...actual,
    ffprobe: vi.fn(async () => ({
      format: { duration: '100' },
      streams: [
        { codec_type: 'video', width: 720, height: 1280, duration: '100' },
      ],
    })),
    runFfmpeg: vi.fn(async () => undefined),
  };
});

const STREAM = '11111111-2222-4333-8444-555555555555';
const FILE = `live-${STREAM}.mp4`;

describe('LiveReplayMaker', () => {
  let root: string;
  let recordings: string;
  const tx = {
    liveStream: { updateMany: vi.fn() },
  };
  const prisma = {
    liveStream: { findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const storedFiles = { record: vi.fn(async () => undefined) };
  const maker = new LiveReplayMaker(
    prisma as unknown as PrismaService,
    storedFiles as unknown as StoredFilesService,
  );
  const waiting = (over: Record<string, unknown> = {}) => ({
    id: STREAM,
    hostId: 'host-1',
    recordingStatus: 'PROCESSING',
    recordingFile: FILE,
    recordingDurationMs: 90_000,
    ...over,
  });
  const folders = () =>
    fs.readdirSync(path.join(root, 'uploads')).filter((name) => name);

  beforeEach(() => {
    vi.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'live-replay-'));
    recordings = path.join(root, 'recordings');
    fs.mkdirSync(recordings);
    fs.mkdirSync(path.join(root, 'uploads'));
    fs.writeFileSync(path.join(recordings, FILE), 'raw');
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    vi.stubEnv('LIVE_RECORDINGS_DIR', '');
    tx.liveStream.updateMany.mockResolvedValue({ count: 1 });
    prisma.liveStream.findUnique.mockResolvedValue(waiting());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('refuses a job with no broadcast', async () => {
    await expect(maker.make(undefined)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it.each([
    [null],
    [waiting({ recordingStatus: 'READY' })],
    [waiting({ recordingFile: null })],
  ])(
    'does nothing for a recording not waiting for its replay (%o)',
    async (row) => {
      prisma.liveStream.findUnique.mockResolvedValue(row);
      await maker.make(STREAM);
      expect(runFfmpeg).not.toHaveBeenCalled();
    },
  );

  it('refuses a file that is not the one asked of the recorder', async () => {
    prisma.liveStream.findUnique.mockResolvedValue(
      waiting({ recordingFile: '../uploads/other.mp4' }),
    );
    await expect(maker.make(STREAM)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(runFfmpeg).not.toHaveBeenCalled();
  });

  it("refuses a file that is not in the recorder's folder", async () => {
    fs.rmSync(path.join(recordings, FILE));
    await expect(maker.make(STREAM)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("reads the recorder's folder named by LIVE_RECORDINGS_DIR", async () => {
    const elsewhere = path.join(root, 'elsewhere');
    fs.mkdirSync(elsewhere);
    fs.writeFileSync(path.join(elsewhere, FILE), 'raw');
    vi.stubEnv('LIVE_RECORDINGS_DIR', elsewhere);
    await maker.make(STREAM);
    expect(fs.existsSync(path.join(elsewhere, FILE))).toBe(false);
    expect(fs.existsSync(path.join(recordings, FILE))).toBe(true);
  });

  it("makes the picture and the stream, saves them as the host's and deletes the recorder's file", async () => {
    await maker.make(STREAM);

    const [folder] = folders();
    expect(folder).toMatch(/^[0-9a-f-]{36}$/);
    const [shot, stream] = vi.mocked(runFfmpeg).mock.calls.map((c) => c[0]);
    expect(shot).toContain(path.join(root, 'uploads', folder, 'thumb.jpg'));
    expect(stream).toEqual(
      replayArgs(
        path.join(recordings, FILE),
        path.join(root, 'uploads', folder),
        path.join(root, 'uploads', folder, 'master.m3u8'),
      ),
    );
    expect(tx.liveStream.updateMany).toHaveBeenCalledWith({
      where: { id: STREAM, recordingStatus: 'PROCESSING', recordingFile: FILE },
      data: {
        recordingStatus: 'READY',
        replayUrl: `/uploads/${folder}/master.m3u8`,
        thumbnailUrl: `/uploads/${folder}/thumb.jpg`,
        recordingFile: null,
      },
    });
    expect(storedFiles.record).toHaveBeenCalledWith(
      [`/uploads/${folder}.mp4`],
      { profileId: 'host-1' },
      tx,
    );
    expect(fs.existsSync(path.join(recordings, FILE))).toBe(false);
  });

  it('encodes the replay small: CRF 26 with a ceiling, medium, AAC 96k, 4-second pieces', () => {
    const args = replayArgs('in.mp4', 'out', 'out/master.m3u8').join(' ');
    expect(args).toContain('-c:v libx264 -preset medium');
    expect(args).toContain('-crf 26 -maxrate 1200k -bufsize 2400k');
    expect(args).toContain('-b:a 96k');
    expect(args).toContain('-hls_time 4');
  });

  it('drops what it made when the recording no longer waits for it', async () => {
    tx.liveStream.updateMany.mockResolvedValue({ count: 0 });
    await maker.make(STREAM);
    expect(folders()).toEqual([]);
    expect(storedFiles.record).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(recordings, FILE))).toBe(true);
  });

  it("keeps the recorder's file for another try when the replay cannot be made", async () => {
    vi.mocked(runFfmpeg).mockRejectedValueOnce(new Error('ffmpeg died'));
    prisma.liveStream.findUnique.mockResolvedValue(
      waiting({ recordingDurationMs: null }),
    );
    await expect(maker.make(STREAM)).rejects.toThrow('ffmpeg died');
    expect(folders()).toEqual([]);
    expect(fs.existsSync(path.join(recordings, FILE))).toBe(true);
  });

  it("goes on when the recorder's file cannot be deleted", async () => {
    vi.spyOn(fs.promises, 'rm').mockImplementation(async (target) => {
      if (String(target).endsWith(FILE)) throw new Error('read-only');
    });
    await expect(maker.make(STREAM)).resolves.toBeUndefined();
  });

  it('goes on when a refused file cannot be cleaned either', async () => {
    tx.liveStream.updateMany.mockResolvedValue({ count: 0 });
    vi.spyOn(fs.promises, 'rm').mockRejectedValue('busy');
    await expect(maker.make(STREAM)).resolves.toBeUndefined();
  });

  it("goes on when the recorder's file cannot be deleted, whatever is thrown", async () => {
    vi.spyOn(fs.promises, 'rm').mockImplementation(async (target) => {
      if (String(target).endsWith(FILE)) throw 'read-only';
    });
    await expect(maker.make(STREAM)).resolves.toBeUndefined();
  });

  describe('markFailed', () => {
    it('marks a recording waiting for its replay as failed', async () => {
      await maker.markFailed(STREAM);
      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
        where: { id: STREAM, recordingStatus: 'PROCESSING' },
        data: { recordingStatus: 'FAILED' },
      });
    });

    it('does nothing without a broadcast', async () => {
      await maker.markFailed(undefined);
      expect(prisma.liveStream.updateMany).not.toHaveBeenCalled();
    });
  });
});
