import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { UnrecoverableError } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ffprobe, runFfmpeg } from '../../common/media/ffmpeg-runner.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StoredFilesService } from '../services/stored-files.service.js';
import {
  composeArgs,
  LiveReplayMaker,
  placeInColumns,
  replayArgs,
} from './live-replay.maker.js';

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
const FILE = `live-${STREAM}-host.mp4`;
const CO1 = `live-${STREAM}-cohost-1.mp4`;
const ANA = 'aaaaaaaa-2222-4333-8444-555555555555';
const BEA = 'bbbbbbbb-2222-4333-8444-555555555555';
const CAI = 'cccccccc-2222-4333-8444-555555555555';
const DAN = 'dddddddd-2222-4333-8444-555555555555';
const guestFile = (profileId: string, n: number) =>
  `live-${STREAM}-guest-${profileId}-${n}.mp4`;
const AT = new Date('2026-10-27T12:00:00Z');
const later = (ms: number) => new Date(AT.getTime() + ms);

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
    recordingParts: [{ role: 'HOST', file: FILE, startedAt: AT }],
    ...over,
  });
  const coHostPart = (
    file: string,
    startedAt: Date,
    profileId: string | null = null,
    durationMs: number | null = null,
  ) => ({
    role: 'COHOST',
    file,
    startedAt,
    durationMs,
    profileId,
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

  describe('with guests', () => {
    const tile = (width: number) =>
      `scale=${width}:640:force_original_aspect_ratio=increase,crop=${width}:640,setsar=1,fps=30`;
    const encoding = (out: string) => [
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-profile:v',
      'main',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '26',
      '-maxrate',
      '1200k',
      '-bufsize',
      '2400k',
      '-g',
      '60',
      '-keyint_min',
      '60',
      '-sc_threshold',
      '0',
      '-threads',
      '2',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-ar',
      '48000',
      '-f',
      'hls',
      '-hls_time',
      '4',
      '-hls_playlist_type',
      'vod',
      '-hls_segment_filename',
      path.join(out, '720p_%03d.ts'),
      path.join(out, 'master.m3u8'),
    ];
    const graphOf = (args: string[]) =>
      args[args.indexOf('-filter_complex') + 1];

    it('stacks the host over one column of guest parts, each at the moment it began, and mixes every sound', () => {
      expect(
        composeArgs(
          { file: 'host.mp4', audio: true },
          [
            { file: 'co1.mp4', audio: true, offsetMs: 5000, column: 0 },
            { file: 'co2.mp4', audio: false, offsetMs: 61_250, column: 0 },
          ],
          'out',
          path.join('out', 'master.m3u8'),
        ),
      ).toEqual([
        '-i',
        'host.mp4',
        '-i',
        'co1.mp4',
        '-i',
        'co2.mp4',
        '-y',
        '-filter_complex_threads',
        '2',
        '-filter_complex',
        [
          `[0:v]setpts=PTS-STARTPTS,${tile(720)}[top]`,
          'color=c=black:s=720x640:r=30[col0_0]',
          `[1:v]setpts=PTS-STARTPTS+5.000/TB,${tile(720)}[g1]`,
          '[col0_0][g1]overlay=eof_action=pass:repeatlast=0[col0_1]',
          '[1:a]aresample=48000,asetpts=PTS-STARTPTS,adelay=5000:all=1[a1]',
          `[2:v]setpts=PTS-STARTPTS+61.250/TB,${tile(720)}[g2]`,
          '[col0_1][g2]overlay=eof_action=pass:repeatlast=0[col0_2]',
          '[top][col0_2]vstack=inputs=2:shortest=1,format=yuv420p[v]',
          '[0:a]aresample=48000,asetpts=PTS-STARTPTS[a0]',
          '[a0][a1]amix=inputs=2:duration=first:normalize=0[a]',
        ].join(';'),
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-shortest',
        ...encoding('out'),
      ]);
    });

    it('puts three guests side by side below the host, each in a column a third wide', () => {
      const graph = graphOf(
        composeArgs(
          { file: 'host.mp4', audio: true },
          [
            { file: 'a1.mp4', audio: true, offsetMs: 0, column: 0 },
            { file: 'b1.mp4', audio: true, offsetMs: 1000, column: 1 },
            { file: 'c1.mp4', audio: true, offsetMs: 2000, column: 2 },
            { file: 'a2.mp4', audio: true, offsetMs: 9000, column: 0 },
          ],
          'out',
          'out/master.m3u8',
        ),
      );
      expect(graph.split(';')).toEqual([
        `[0:v]setpts=PTS-STARTPTS,${tile(720)}[top]`,
        'color=c=black:s=240x640:r=30[col0_0]',
        'color=c=black:s=240x640:r=30[col1_0]',
        'color=c=black:s=240x640:r=30[col2_0]',
        `[1:v]setpts=PTS-STARTPTS+0.000/TB,${tile(240)}[g1]`,
        '[col0_0][g1]overlay=eof_action=pass:repeatlast=0[col0_1]',
        '[1:a]aresample=48000,asetpts=PTS-STARTPTS,adelay=0:all=1[a1]',
        `[2:v]setpts=PTS-STARTPTS+1.000/TB,${tile(240)}[g2]`,
        '[col1_0][g2]overlay=eof_action=pass:repeatlast=0[col1_1]',
        '[2:a]aresample=48000,asetpts=PTS-STARTPTS,adelay=1000:all=1[a2]',
        `[3:v]setpts=PTS-STARTPTS+2.000/TB,${tile(240)}[g3]`,
        '[col2_0][g3]overlay=eof_action=pass:repeatlast=0[col2_1]',
        '[3:a]aresample=48000,asetpts=PTS-STARTPTS,adelay=2000:all=1[a3]',
        `[4:v]setpts=PTS-STARTPTS+9.000/TB,${tile(240)}[g4]`,
        '[col0_1][g4]overlay=eof_action=pass:repeatlast=0[col0_2]',
        '[4:a]aresample=48000,asetpts=PTS-STARTPTS,adelay=9000:all=1[a4]',
        '[col0_2][col1_1][col2_1]hstack=inputs=3[bottom]',
        '[top][bottom]vstack=inputs=2:shortest=1,format=yuv420p[v]',
        '[0:a]aresample=48000,asetpts=PTS-STARTPTS[a0]',
        '[a0][a1][a2][a3][a4]amix=inputs=5:duration=first:normalize=0[a]',
      ]);
    });

    it('shares the width between two columns when two guests were on at once', () => {
      const graph = graphOf(
        composeArgs(
          { file: 'host.mp4', audio: false },
          [
            { file: 'a1.mp4', audio: false, offsetMs: 0, column: 0 },
            { file: 'b1.mp4', audio: false, offsetMs: 0, column: 1 },
          ],
          'out',
          'out/master.m3u8',
        ),
      );
      expect(graph).toContain('color=c=black:s=360x640:r=30[col1_0]');
      expect(graph).toContain(tile(360));
      expect(graph).toContain('[col0_1][col1_1]hstack=inputs=2[bottom]');
    });

    it('puts silence in place of a host with no sound', () => {
      const graph = graphOf(
        composeArgs(
          { file: 'host.mp4', audio: false },
          [{ file: 'co1.mp4', audio: true, offsetMs: 0, column: 0 }],
          'out',
          'out/master.m3u8',
        ),
      );
      expect(graph).toContain('anullsrc=r=48000:cl=stereo[a0]');
      expect(graph).toContain(
        '[a0][a1]amix=inputs=2:duration=first:normalize=0[a]',
      );
    });

    it('maps no sound when nobody had any', () => {
      const args = composeArgs(
        { file: 'host.mp4', audio: false },
        [{ file: 'co1.mp4', audio: false, offsetMs: 0, column: 0 }],
        'out',
        'out/master.m3u8',
      );
      expect(graphOf(args)).not.toContain('amix');
      expect(args).not.toContain('[a]');
    });

    describe('placeInColumns', () => {
      const part = (
        offsetMs: number,
        durationMs: number | null,
        profileId: string | null,
      ) => ({ offsetMs, durationMs, profileId });

      it('gives guests on at once a column each, up to three', () => {
        expect(
          placeInColumns([
            part(0, 10_000, ANA),
            part(1000, 10_000, BEA),
            part(2000, 10_000, CAI),
          ]),
        ).toEqual([0, 1, 2]);
      });

      it('keeps a guest who comes back in the column they had, when it is free', () => {
        expect(
          placeInColumns([
            part(0, 5000, ANA),
            part(1000, 2000, BEA),
            // Both columns are free again; each takes their own back.
            part(8000, 1000, BEA),
            part(8000, 1000, ANA),
          ]),
        ).toEqual([0, 1, 1, 0]);
      });

      it('gives a guest whose column is taken the first one free', () => {
        expect(
          placeInColumns([
            part(0, 1000, ANA),
            part(2000, 10_000, BEA),
            // Ana's column 0 is taken by Cai meanwhile; Bea's is column 1.
            part(1500, 10_000, CAI),
            part(5000, 1000, ANA),
          ]),
        ).toEqual([0, 1, 0, 2]);
      });

      it('lets a fourth guest have the column of one who left', () => {
        expect(
          placeInColumns([
            part(0, 1000, ANA),
            part(0, 10_000, BEA),
            part(0, 10_000, CAI),
            part(2000, 1000, DAN),
          ]),
        ).toEqual([0, 1, 2, 0]);
      });

      it('leaves out a part that overlaps more guests than there are columns', () => {
        expect(
          placeInColumns([
            part(0, 10_000, ANA),
            part(0, 10_000, BEA),
            part(0, 10_000, CAI),
            part(500, 1000, DAN),
          ]),
        ).toEqual([0, 1, 2, null]);
      });

      it('takes a part of unknown length to last to the end, and parts of nobody named as one guest', () => {
        expect(
          placeInColumns([part(0, null, null), part(9_000_000, 1000, null)], 2),
        ).toEqual([0, 1]);
      });
    });

    it("composes the guests' parts in the recorder's folder in their columns, and deletes every file", async () => {
      for (const file of [
        guestFile(ANA, 1),
        guestFile(BEA, 1),
        guestFile(ANA, 2),
        CO1,
      ]) {
        fs.writeFileSync(path.join(recordings, file), 'raw');
      }
      prisma.liveStream.findUnique.mockResolvedValue(
        waiting({
          recordingParts: [
            // Begun a moment before the host's: placed at the start.
            coHostPart(guestFile(ANA, 1), later(-300), ANA, 10_000),
            { role: 'HOST', file: FILE, startedAt: AT },
            coHostPart(guestFile(BEA, 1), later(5000), BEA, 60_000),
            // Ana again while Bea is still on: back in her own column.
            coHostPart(guestFile(ANA, 2), later(20_000), ANA, null),
            // A part of the old co-host, named before guests were.
            coHostPart(CO1, later(70_000), null, null),
            // Not missing from the folder only: never a name of another.
            coHostPart(`live-${STREAM}-cohost-x.mp4`, later(1)),
            coHostPart(`live-other-guest-${ANA}-1.mp4`, later(1), ANA),
            coHostPart(guestFile(CAI, 1), later(1), CAI),
          ],
        }),
      );
      vi.mocked(ffprobe)
        .mockResolvedValueOnce({
          format: { duration: '100' },
          streams: [
            { codec_type: 'video', width: 720, height: 1280 },
            { codec_type: 'audio' },
          ],
        })
        .mockResolvedValueOnce({ streams: [{ codec_type: 'audio' }] })
        .mockResolvedValueOnce({})
        // Its length read from the file, as the recorder did not say.
        .mockResolvedValueOnce({ format: { duration: '4.5' } })
        .mockResolvedValueOnce({ format: {} });

      await maker.make(STREAM);

      const [folder] = folders();
      const out = path.join(root, 'uploads', folder);
      expect(vi.mocked(runFfmpeg).mock.calls[1][0]).toEqual(
        composeArgs(
          { file: path.join(recordings, FILE), audio: true },
          [
            {
              file: path.join(recordings, guestFile(ANA, 1)),
              audio: true,
              offsetMs: 0,
              column: 0,
            },
            {
              file: path.join(recordings, guestFile(BEA, 1)),
              audio: false,
              offsetMs: 5000,
              column: 1,
            },
            {
              file: path.join(recordings, guestFile(ANA, 2)),
              audio: false,
              offsetMs: 20_000,
              column: 0,
            },
            {
              file: path.join(recordings, CO1),
              audio: false,
              offsetMs: 70_000,
              // Ana's second part was over by then (4.5 s, read from it).
              column: 0,
            },
          ],
          out,
          path.join(out, 'master.m3u8'),
        ),
      );
      expect(fs.readdirSync(recordings)).toEqual([]);
    });

    it('leaves out of the replay a part that finds no column, and still deletes its file', async () => {
      const guests = [ANA, BEA, CAI, DAN];
      const files = guests.map((guest) => guestFile(guest, 1));
      for (const file of files) {
        fs.writeFileSync(path.join(recordings, file), 'raw');
      }
      prisma.liveStream.findUnique.mockResolvedValue(
        waiting({
          recordingParts: [
            { role: 'HOST', file: FILE, startedAt: AT },
            ...guests.map((guest, n) =>
              coHostPart(files[n], later(n), guest, 60_000),
            ),
          ],
        }),
      );

      await maker.make(STREAM);

      const args = vi.mocked(runFfmpeg).mock.calls[1][0];
      expect(args).toContain(path.join(recordings, files[2]));
      expect(args).not.toContain(path.join(recordings, files[3]));
      expect(fs.readdirSync(recordings)).toEqual([]);
    });

    it("makes a host's replay when the host's part is not known", async () => {
      fs.writeFileSync(path.join(recordings, CO1), 'raw');
      prisma.liveStream.findUnique.mockResolvedValue(
        waiting({ recordingParts: [coHostPart(CO1, AT)] }),
      );
      await maker.make(STREAM);
      expect(vi.mocked(runFfmpeg).mock.calls[1][0]).toContain('-vf');
      expect(fs.readdirSync(recordings)).toEqual([CO1]);
    });
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
