import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { EgressStatus, ServerError } from 'livekit-server-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { UploadsService } from '../../uploads/uploads.service.js';
import { LiveRecordingService } from './live-recording.service.js';

const sdk = vi.hoisted(() => ({
  createRoom: vi.fn(),
  startParticipantEgress: vi.fn(),
  stopEgress: vi.fn(),
  listEgress: vi.fn(),
  hosts: [] as string[],
}));

vi.mock('livekit-server-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('livekit-server-sdk')>();
  return {
    ...actual,
    EgressClient: vi.fn(function (this: object, host: string) {
      sdk.hosts.push(host);
      Object.assign(this, {
        startParticipantEgress: sdk.startParticipantEgress,
        stopEgress: sdk.stopEgress,
        listEgress: sdk.listEgress,
      });
    }),
    RoomServiceClient: vi.fn(function (this: object) {
      Object.assign(this, { createRoom: sdk.createRoom });
    }),
  };
});

const NOW = new Date('2026-10-27T12:00:00Z');
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);
const HOST_FILE = 'live-s1-host.mp4';
const CO_FILE = 'live-s1-cohost-1.mp4';

type Mock = ReturnType<typeof vi.fn>;

describe('LiveRecordingService', () => {
  let settings: Record<string, string | undefined>;
  let tx: {
    $executeRaw: Mock;
    liveStream: { count: Mock; update: Mock };
    liveRecordingPart: { create: Mock };
  };
  let prisma: {
    $transaction: Mock;
    liveStream: { findUnique: Mock; findMany: Mock; updateMany: Mock };
    liveRecordingPart: { create: Mock; findMany: Mock; updateMany: Mock };
  };
  // What the parts table answers: the jobs held by parts being recorded,
  // and every part of the broadcast when its recording may be finished.
  let held: { egressId: string }[];
  let stored: Record<string, unknown>[];
  let service: LiveRecordingService;
  let recordings: string;
  const raw = (file: string) => path.join(recordings, file);
  let uploads: { enqueueLiveReplay: Mock; recoverLiveReplay: Mock };
  const warnings = () =>
    vi.spyOn(
      (service as unknown as { logger: { warn: () => void } }).logger,
      'warn',
    );

  beforeEach(() => {
    vi.clearAllMocks();
    recordings = fs.mkdtempSync(path.join(os.tmpdir(), 'live-recording-'));
    vi.stubEnv('LIVE_RECORDINGS_DIR', recordings);
    sdk.hosts.length = 0;
    held = [];
    stored = [];
    settings = {
      LIVE_RECORDING_ENABLED: 'true',
      LIVEKIT_URL: 'wss://live.example.com',
      LIVEKIT_API_KEY: 'key',
      LIVEKIT_API_SECRET: 'secret',
    };
    tx = {
      $executeRaw: vi.fn(async () => 1),
      liveStream: { count: vi.fn(async () => 0), update: vi.fn() },
      liveRecordingPart: { create: vi.fn(async () => ({ id: 'P_HOST' })) },
    };
    prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
      liveStream: {
        findUnique: vi.fn(),
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      liveRecordingPart: {
        create: vi.fn(async (args: { data: { file: string } }) => ({
          id: 'P_CO',
          file: args.data.file,
        })),
        findMany: vi.fn(async (args: { select: { role?: boolean } }) =>
          args.select.role ? stored : held,
        ),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    sdk.createRoom.mockResolvedValue({});
    sdk.startParticipantEgress.mockResolvedValue({ egressId: 'EG_1' });
    sdk.stopEgress.mockResolvedValue({});
    sdk.listEgress.mockResolvedValue([]);
    uploads = {
      enqueueLiveReplay: vi.fn(async () => undefined),
      recoverLiveReplay: vi.fn(async () => true),
    };
    service = new LiveRecordingService(
      prisma as unknown as PrismaService,
      { get: (key: string) => settings[key] } as unknown as ConfigService,
      uploads as unknown as UploadsService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(recordings, { recursive: true, force: true });
  });

  describe('recordingsAtOnce', () => {
    it.each([
      [undefined, 1],
      ['1', 1],
      ['3', 3],
      ['0', 1],
      ['-2', 1],
      ['1.5', 1],
      ['many', 1],
    ])('reads LIVE_RECORDINGS_AT_ONCE=%s as %i', (value, expected) => {
      settings.LIVE_RECORDINGS_AT_ONCE = value;
      expect(service.recordingsAtOnce()).toBe(expected);
    });
  });

  describe('start', () => {
    it('does nothing where the environment has no recorder of its own', async () => {
      settings.LIVE_RECORDING_ENABLED = undefined;
      await service.start('s1', 'host-1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(sdk.startParticipantEgress).not.toHaveBeenCalled();
    });

    it.each([
      ['wss://project.livekit.cloud', undefined],
      ['wss://live.example.com', 'https://project.livekit.cloud/'],
    ])(
      'never records through the hosted service (%s, %s)',
      async (url, api) => {
        settings.LIVEKIT_URL = url;
        settings.LIVEKIT_API_URL = api;
        expect(service.isEnabled()).toBe(false);
        await service.start('s1', 'host-1');
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it("takes a place under the lock and records the host's own camera and microphone to one MP4 file", async () => {
      await service.start('s1', 'host-1');

      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(tx.liveStream.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: {
          recordingStatus: 'RECORDING',
          recordingStartedAt: expect.any(Date),
        },
      });
      expect(tx.liveRecordingPart.create).toHaveBeenCalledWith({
        data: { streamId: 's1', role: 'HOST', file: HOST_FILE },
        select: { id: true },
      });
      expect(sdk.createRoom).toHaveBeenCalledWith({
        name: 's1',
        emptyTimeout: 300,
      });
      const [room, identity, output, options] =
        sdk.startParticipantEgress.mock.calls[0];
      expect(room).toBe('s1');
      expect(identity).toBe('host-1');
      expect(output.file.filepath).toBe(`/out/${HOST_FILE}`);
      expect(options.encodingOptions).toMatchObject({
        width: 720,
        height: 1280,
        framerate: 30,
        videoBitrate: 1500,
        audioBitrate: 96,
        keyFrameInterval: 2,
      });
      expect(prisma.liveRecordingPart.updateMany).toHaveBeenCalledWith({
        where: { id: 'P_HOST', status: 'RECORDING', egressId: null },
        data: { egressId: 'EG_1' },
      });
      // The browsers' address, asked over https.
      expect(sdk.hosts).toEqual(['https://live.example.com']);
    });

    it('asks the API at its own address when one is set', async () => {
      settings.LIVEKIT_API_URL = 'http://livekit:7880';
      await service.start('s1', 'host-1');
      expect(sdk.hosts).toEqual(['http://livekit:7880']);
    });

    it('records one broadcast at a time unless the setting says more', async () => {
      tx.liveStream.count.mockResolvedValue(1);
      await service.start('s1', 'host-1');
      expect(tx.liveStream.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { recordingStatus: 'SKIPPED_LIMIT' },
      });
      expect(tx.liveRecordingPart.create).not.toHaveBeenCalled();
      expect(sdk.startParticipantEgress).not.toHaveBeenCalled();

      settings.LIVE_RECORDINGS_AT_ONCE = '2';
      await service.start('s2', 'host-2');
      expect(sdk.startParticipantEgress).toHaveBeenCalledTimes(1);
    });

    it('counts only broadcasts still on air: one that ended takes no place while its files settle', async () => {
      await service.start('s1', 'host-1');
      expect(tx.liveStream.count).toHaveBeenCalledWith({
        where: { recordingStatus: 'RECORDING', status: 'LIVE' },
      });
    });

    it('leaves the broadcast as it is when no place can be taken', async () => {
      prisma.$transaction.mockRejectedValue(new Error('db down'));
      await expect(service.start('s1', 'host-1')).resolves.toBeUndefined();
      expect(sdk.startParticipantEgress).not.toHaveBeenCalled();
    });

    it('marks the part and the recording failed when the recorder refuses it', async () => {
      sdk.startParticipantEgress.mockRejectedValue('no recorder');
      await expect(service.start('s1', 'host-1')).resolves.toBeUndefined();
      expect(prisma.liveRecordingPart.updateMany).toHaveBeenCalledWith({
        where: { id: 'P_HOST', status: 'RECORDING' },
        data: { status: 'FAILED', endedAt: expect.any(Date) },
      });
      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', recordingStatus: 'RECORDING' },
        data: { recordingStatus: 'FAILED' },
      });
    });

    it('stops the jobs no part holds, and deletes the file it began', async () => {
      // The answer timed out, but the recorder had started the job.
      sdk.startParticipantEgress.mockRejectedValue(new Error('timed out'));
      held = [{ egressId: 'EG_KEPT' }];
      sdk.listEgress.mockResolvedValue([
        { egressId: 'EG_A' },
        { egressId: 'EG_KEPT' },
        { egressId: 'EG_B' },
      ]);
      sdk.stopEgress.mockRejectedValueOnce(
        new ServerError('twirp', 'EGRESS_ENDING', 412, 'failed_precondition'),
      );
      fs.writeFileSync(raw(HOST_FILE), 'raw');

      await service.start('s1', 'host-1');

      expect(sdk.listEgress).toHaveBeenCalledWith({
        roomName: 's1',
        active: true,
      });
      expect(sdk.stopEgress.mock.calls).toEqual([['EG_A'], ['EG_B']]);
      expect(fs.existsSync(raw(HOST_FILE))).toBe(false);
    });

    it('stops the job when the check gave the part up before the recorder answered', async () => {
      prisma.liveRecordingPart.updateMany.mockResolvedValueOnce({ count: 0 });
      fs.writeFileSync(raw(HOST_FILE), 'raw');

      await service.start('s1', 'host-1');

      expect(sdk.stopEgress).toHaveBeenCalledWith('EG_1');
      expect(fs.existsSync(raw(HOST_FILE))).toBe(false);
      expect(prisma.liveStream.updateMany).not.toHaveBeenCalled();
    });

    it('still marks the recording failed when stray jobs cannot be listed', async () => {
      sdk.startParticipantEgress.mockRejectedValue(new Error('timed out'));
      sdk.listEgress.mockRejectedValue(new Error('unreachable'));
      vi.spyOn(fs.promises, 'rm').mockRejectedValueOnce(new Error('read-only'));
      await service.start('s1', 'host-1');
      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { recordingStatus: 'FAILED' } }),
      );
    });

    it('does not throw when even marking the failure fails', async () => {
      sdk.createRoom.mockRejectedValue(new Error('no live service'));
      prisma.liveRecordingPart.updateMany.mockRejectedValue('db down');
      prisma.liveStream.updateMany.mockRejectedValue(new Error('db down'));
      await expect(service.start('s1', 'host-1')).resolves.toBeUndefined();
    });
  });

  describe('startCoHost', () => {
    const live = (parts: Record<string, unknown>[] = []) => ({
      status: 'LIVE',
      recordingStatus: 'RECORDING',
      recordingParts: parts,
    });

    it('does nothing where recording is off', async () => {
      settings.LIVE_RECORDING_ENABLED = 'false';
      await service.startCoHost('s1', 'co-1');
      expect(prisma.liveStream.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      [null],
      [{ ...live(), status: 'ENDED' }],
      [{ ...live(), recordingStatus: 'SKIPPED_LIMIT' }],
    ])(
      'records no co-host of a broadcast not being recorded (%o)',
      async (row) => {
        prisma.liveStream.findUnique.mockResolvedValue(row);
        await service.startCoHost('s1', 'co-1');
        expect(prisma.liveRecordingPart.create).not.toHaveBeenCalled();
        expect(sdk.startParticipantEgress).not.toHaveBeenCalled();
      },
    );

    it("records the co-host's own camera and microphone as the next part", async () => {
      prisma.liveStream.findUnique.mockResolvedValue(
        live([{ egressId: 'EG_C1', status: 'DONE' }]),
      );
      sdk.startParticipantEgress.mockResolvedValue({ egressId: 'EG_C2' });

      await service.startCoHost('s1', 'co-1');

      expect(prisma.liveStream.findUnique).toHaveBeenCalledWith({
        where: { id: 's1' },
        select: {
          status: true,
          recordingStatus: true,
          recordingParts: {
            where: { role: 'COHOST' },
            select: { egressId: true, status: true },
          },
        },
      });
      expect(prisma.liveRecordingPart.create).toHaveBeenCalledWith({
        data: { streamId: 's1', role: 'COHOST', file: 'live-s1-cohost-2.mp4' },
        select: { id: true, file: true },
      });
      const [room, identity, output] = sdk.startParticipantEgress.mock.calls[0];
      expect([room, identity, output.file.filepath]).toEqual([
        's1',
        'co-1',
        '/out/live-s1-cohost-2.mp4',
      ]);
      expect(prisma.liveRecordingPart.updateMany).toHaveBeenCalledWith({
        where: { id: 'P_CO', status: 'RECORDING', egressId: null },
        data: { egressId: 'EG_C2' },
      });
      expect(sdk.createRoom).not.toHaveBeenCalled();
    });

    it.each([
      ['being started', null, []],
      ['recording', 'EG_C1', [{ status: EgressStatus.EGRESS_ACTIVE }]],
      ['starting', 'EG_C1', [{ status: EgressStatus.EGRESS_STARTING }]],
    ])(
      'does not record twice a co-host whose part is %s',
      async (_label, egressId, jobs) => {
        prisma.liveStream.findUnique.mockResolvedValue(
          live([{ egressId, status: 'RECORDING' }]),
        );
        sdk.listEgress.mockResolvedValue(jobs);
        await service.startCoHost('s1', 'co-1');
        expect(prisma.liveRecordingPart.create).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['over', [{ status: EgressStatus.EGRESS_COMPLETE }]],
      ['unknown to the recorder', []],
    ])(
      'records a co-host joining again when the last part is %s, before the check sees it',
      async (_label, jobs) => {
        prisma.liveStream.findUnique.mockResolvedValue(
          live([{ egressId: 'EG_C1', status: 'RECORDING' }]),
        );
        sdk.listEgress.mockResolvedValue(jobs);
        await service.startCoHost('s1', 'co-1');
        expect(sdk.listEgress).toHaveBeenCalledWith({ egressId: 'EG_C1' });
        expect(prisma.liveRecordingPart.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ file: 'live-s1-cohost-2.mp4' }),
          }),
        );
      },
    );

    it('keeps no more than twenty co-host parts', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(
        live(Array.from({ length: 20 }, () => ({ status: 'DONE' }))),
      );
      await service.startCoHost('s1', 'co-1');
      expect(prisma.liveRecordingPart.create).not.toHaveBeenCalled();
    });

    it('records nothing when another join took the same part first', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(live());
      prisma.liveRecordingPart.create.mockRejectedValue(
        new Error('Unique constraint failed on the fields: (`file`)'),
      );
      await expect(service.startCoHost('s1', 'co-1')).resolves.toBeUndefined();
      expect(sdk.startParticipantEgress).not.toHaveBeenCalled();
    });

    it("gives the part up when the recorder refuses it, leaving the host's job", async () => {
      prisma.liveStream.findUnique.mockResolvedValue(live());
      sdk.startParticipantEgress.mockRejectedValue('busy');
      held = [{ egressId: 'EG_1' }];
      sdk.listEgress.mockResolvedValue([
        { egressId: 'EG_1' },
        { egressId: 'EG_LATE' },
      ]);
      fs.writeFileSync(raw(CO_FILE), 'raw');

      await expect(service.startCoHost('s1', 'co-1')).resolves.toBeUndefined();

      expect(prisma.liveRecordingPart.updateMany).toHaveBeenCalledWith({
        where: { id: 'P_CO', status: 'RECORDING' },
        data: { status: 'FAILED', endedAt: expect.any(Date) },
      });
      expect(sdk.stopEgress.mock.calls).toEqual([['EG_LATE']]);
      expect(fs.existsSync(raw(CO_FILE))).toBe(false);
      expect(prisma.liveStream.updateMany).not.toHaveBeenCalled();
    });

    it('does not throw when even giving the part up fails', async () => {
      prisma.liveStream.findUnique.mockResolvedValue(live());
      sdk.startParticipantEgress.mockRejectedValue(new Error('busy'));
      prisma.liveRecordingPart.updateMany.mockRejectedValue(new Error('down'));
      await expect(service.startCoHost('s1', 'co-1')).resolves.toBeUndefined();
    });
  });

  describe('stop and stopCoHost', () => {
    it('do nothing where recording is off', async () => {
      settings.LIVE_RECORDING_ENABLED = 'false';
      await service.stop('s1');
      await service.stopCoHost('s1');
      expect(prisma.liveRecordingPart.findMany).not.toHaveBeenCalled();
    });

    it('stops every job of a broadcast that ended', async () => {
      held = [{ egressId: 'EG_1' }, { egressId: 'EG_C1' }];
      await service.stop('s1');
      expect(prisma.liveRecordingPart.findMany).toHaveBeenCalledWith({
        where: { streamId: 's1', status: 'RECORDING', egressId: { not: null } },
        select: { egressId: true },
      });
      expect(sdk.stopEgress.mock.calls).toEqual([['EG_1'], ['EG_C1']]);
    });

    it("stops only the co-host's job when the co-host leaves", async () => {
      held = [{ egressId: 'EG_C1' }];
      await service.stopCoHost('s1');
      expect(prisma.liveRecordingPart.findMany).toHaveBeenCalledWith({
        where: {
          streamId: 's1',
          status: 'RECORDING',
          egressId: { not: null },
          role: 'COHOST',
        },
        select: { egressId: true },
      });
      expect(sdk.stopEgress).toHaveBeenCalledWith('EG_C1');
    });

    it.each([
      new ServerError('twirp', 'cannot stop', 412, 'failed_precondition'),
      new ServerError('twirp', 'egress not found', 404, 'not_found'),
      new ServerError('twirp', 'egress with status EGRESS_COMPLETE', 500),
    ])('takes a job already ending or over as stopped (%o)', async (answer) => {
      held = [{ egressId: 'EG_1' }];
      sdk.stopEgress.mockRejectedValue(answer);
      const warn = warnings();
      await service.stop('s1');
      expect(warn).not.toHaveBeenCalled();
    });

    it('does not throw when the recorder cannot be reached', async () => {
      held = [{ egressId: 'EG_1' }];
      sdk.stopEgress.mockRejectedValue(new Error('unreachable'));
      await expect(service.stop('s1')).resolves.toBeUndefined();
    });
  });

  describe('check', () => {
    const hostPart = (over: Record<string, unknown> = {}) => ({
      id: 'P_HOST',
      role: 'HOST',
      egressId: 'EG_1',
      file: HOST_FILE,
      status: 'RECORDING',
      startedAt: minutesAgo(10),
      ...over,
    });
    const coPart = (over: Record<string, unknown> = {}) => ({
      id: 'P_CO',
      role: 'COHOST',
      egressId: 'EG_C1',
      file: CO_FILE,
      status: 'RECORDING',
      startedAt: minutesAgo(5),
      ...over,
    });
    const running = (over: Record<string, unknown> = {}) => ({
      id: 's1',
      status: 'LIVE',
      endedAt: null,
      recordingStartedAt: minutesAgo(10),
      recordingParts: [hostPart()],
      ...over,
    });
    const fileOf = (over: Record<string, unknown> = {}) => ({
      filename: `/out/${HOST_FILE}`,
      size: 1_000_000n,
      duration: 90_000_000_000n,
      startedAt: 0n,
      endedAt: 0n,
      ...over,
    });
    const jobs = (byId: Record<string, Record<string, unknown>>) =>
      sdk.listEgress.mockImplementation(async (args: { egressId?: string }) =>
        args.egressId && byId[args.egressId] ? [byId[args.egressId]] : [],
      );
    const doneHost = {
      role: 'HOST',
      file: HOST_FILE,
      status: 'DONE',
      durationMs: 90_000,
      sizeBytes: 1_000_000n,
    };

    it('does nothing where recording is off', async () => {
      settings.LIVE_RECORDING_ENABLED = undefined;
      expect(await service.check(NOW)).toBe(0);
      expect(prisma.liveStream.findMany).not.toHaveBeenCalled();
    });

    it('reads each running recording with its parts', async () => {
      await service.check(NOW);
      expect(prisma.liveStream.findMany).toHaveBeenCalledWith({
        where: { recordingStatus: 'RECORDING' },
        select: {
          id: true,
          status: true,
          endedAt: true,
          recordingStartedAt: true,
          recordingParts: {
            select: {
              id: true,
              role: true,
              egressId: true,
              file: true,
              status: true,
              startedAt: true,
            },
            orderBy: { startedAt: 'asc' },
          },
        },
        orderBy: { recordingStartedAt: 'asc' },
        take: 50,
      });
    });

    it('leaves a recording of a broadcast still on air', async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([
        running({ recordingParts: [hostPart(), coPart()] }),
      ]);
      jobs({
        EG_1: { status: EgressStatus.EGRESS_ACTIVE },
        EG_C1: { status: EgressStatus.EGRESS_ACTIVE },
      });
      stored = [{ ...doneHost, status: 'RECORDING' }];
      expect(await service.check(NOW)).toBe(0);
      expect(sdk.stopEgress).not.toHaveBeenCalled();
      expect(prisma.liveRecordingPart.updateMany).not.toHaveBeenCalled();
      expect(prisma.liveStream.updateMany).not.toHaveBeenCalled();
    });

    it('stops every part of a broadcast that ended', async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([
        running({
          status: 'ENDED',
          endedAt: minutesAgo(1),
          recordingParts: [hostPart(), coPart()],
        }),
      ]);
      jobs({
        EG_1: { status: EgressStatus.EGRESS_STARTING },
        EG_C1: { status: EgressStatus.EGRESS_ACTIVE },
      });
      await service.check(NOW);
      expect(sdk.stopEgress.mock.calls).toEqual([['EG_1'], ['EG_C1']]);
    });

    it('stops a recording at four hours while the broadcast goes on', async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([
        running({ recordingStartedAt: minutesAgo(240) }),
      ]);
      jobs({ EG_1: { status: EgressStatus.EGRESS_ACTIVE } });
      await service.check(NOW);
      expect(sdk.stopEgress).toHaveBeenCalledWith('EG_1');
    });

    it.each([
      ['finishes now', hostPart()],
      ['was over before', hostPart({ status: 'DONE' })],
    ])("stops the co-host's part when the host's %s", async (_label, host) => {
      prisma.liveStream.findMany.mockResolvedValueOnce([
        running({ recordingParts: [host, coPart()] }),
      ]);
      jobs({
        EG_1: {
          status: EgressStatus.EGRESS_COMPLETE,
          fileResults: [fileOf()],
        },
        EG_C1: { status: EgressStatus.EGRESS_ACTIVE },
      });
      await service.check(NOW);
      expect(sdk.stopEgress.mock.calls).toEqual([['EG_C1']]);
    });

    it('leaves a part the recorder is closing', async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([running()]);
      jobs({ EG_1: { status: EgressStatus.EGRESS_ENDING } });
      expect(await service.check(NOW)).toBe(0);
      expect(prisma.liveRecordingPart.updateMany).not.toHaveBeenCalled();
    });

    it.each([EgressStatus.EGRESS_COMPLETE, EgressStatus.EGRESS_LIMIT_REACHED])(
      "takes the host's file and makes the recording into its replay (status %s)",
      async (status) => {
        prisma.liveStream.findMany.mockResolvedValueOnce([running()]);
        jobs({ EG_1: { status, fileResults: [fileOf()] } });
        stored = [doneHost];

        expect(await service.check(NOW)).toBe(1);

        expect(prisma.liveRecordingPart.updateMany).toHaveBeenCalledWith({
          where: { id: 'P_HOST', status: 'RECORDING', egressId: 'EG_1' },
          data: {
            status: 'DONE',
            durationMs: 90_000,
            sizeBytes: 1_000_000n,
            endedAt: NOW,
          },
        });
        expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
          where: { id: 's1', recordingStatus: 'RECORDING' },
          data: {
            recordingStatus: 'PROCESSING',
            recordingFile: HOST_FILE,
            recordingDurationMs: 90_000,
            recordingSizeBytes: 1_000_000n,
          },
        });
        expect(uploads.enqueueLiveReplay).toHaveBeenCalledWith('s1');
      },
    );

    it('keeps the moments the recorder says the file began and ended', async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([running()]);
      const began = minutesAgo(9);
      jobs({
        EG_1: {
          status: EgressStatus.EGRESS_COMPLETE,
          fileResults: [
            fileOf({
              startedAt: BigInt(began.getTime()) * 1_000_000n,
              endedAt: BigInt(NOW.getTime() - 1000) * 1_000_000n,
            }),
          ],
        },
      });
      await service.check(NOW);
      expect(prisma.liveRecordingPart.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startedAt: began,
            endedAt: new Date(NOW.getTime() - 1000),
          }),
        }),
      );
    });

    it("counts every part's size, and waits while one is still recorded", async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([running()]);
      jobs({});
      stored = [
        doneHost,
        { role: 'COHOST', file: CO_FILE, status: 'DONE', sizeBytes: 500n },
        { role: 'COHOST', file: 'x', status: 'DONE', sizeBytes: null },
        { role: 'COHOST', file: 'y', status: 'FAILED', sizeBytes: 7n },
      ];
      await service.check(NOW);
      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recordingSizeBytes: 1_000_500n }),
        }),
      );

      prisma.liveStream.updateMany.mockClear();
      prisma.liveStream.findMany.mockResolvedValueOnce([running()]);
      stored = [doneHost, { role: 'COHOST', status: 'RECORDING' }];
      await service.check(NOW);
      expect(prisma.liveStream.updateMany).not.toHaveBeenCalled();
    });

    it('still counts the recording finished when its replay cannot be asked for now', async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([running()]);
      jobs({});
      stored = [doneHost];
      uploads.enqueueLiveReplay.mockRejectedValue(new Error('redis down'));
      expect(await service.check(NOW)).toBe(1);
    });

    it('counts nothing when another server finished it first', async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([running()]);
      jobs({});
      stored = [doneHost];
      prisma.liveStream.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.check(NOW)).toBe(0);
      expect(uploads.enqueueLiveReplay).not.toHaveBeenCalled();
    });

    it('asks again for the replay of each recording still waiting for one', async () => {
      prisma.liveStream.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 's7' }, { id: 's8' }]);
      uploads.recoverLiveReplay.mockRejectedValueOnce('redis down');
      await service.check(NOW);
      expect(prisma.liveStream.findMany).toHaveBeenLastCalledWith({
        where: { recordingStatus: 'PROCESSING' },
        select: { id: true },
        take: 50,
      });
      expect(uploads.recoverLiveReplay).toHaveBeenCalledWith('s7');
      expect(uploads.recoverLiveReplay).toHaveBeenCalledWith('s8');
    });

    it.each([
      ['no file', []],
      ['an empty file', [fileOf({ size: 0n })]],
      ['a file of another name', [fileOf({ filename: '/out/other.mp4' })]],
    ])('gives up a finished part with %s', async (_label, files) => {
      prisma.liveStream.findMany.mockResolvedValueOnce([running()]);
      jobs({
        EG_1: { status: EgressStatus.EGRESS_COMPLETE, fileResults: files },
      });
      await service.check(NOW);
      expect(prisma.liveRecordingPart.updateMany).toHaveBeenCalledWith({
        where: { id: 'P_HOST', status: 'RECORDING', egressId: 'EG_1' },
        data: { status: 'FAILED', endedAt: expect.any(Date) },
      });
    });

    it.each([EgressStatus.EGRESS_FAILED, EgressStatus.EGRESS_ABORTED])(
      'gives up a part the recorder gave up (status %s)',
      async (status) => {
        prisma.liveStream.findMany.mockResolvedValueOnce([running()]);
        jobs({ EG_1: { status, error: 'boom' } });
        await service.check(NOW);
        expect(prisma.liveRecordingPart.updateMany).toHaveBeenCalledWith({
          where: { id: 'P_HOST', status: 'RECORDING', egressId: 'EG_1' },
          data: { status: 'FAILED', endedAt: expect.any(Date) },
        });
      },
    );

    it("gives the recording up when the host's part holds no file, and deletes the co-host's", async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([
        running({ recordingParts: [] }),
      ]);
      stored = [
        { role: 'HOST', file: HOST_FILE, status: 'FAILED' },
        { role: 'COHOST', file: CO_FILE, status: 'DONE' },
      ];
      fs.writeFileSync(raw(CO_FILE), 'raw');

      expect(await service.check(NOW)).toBe(0);

      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', recordingStatus: 'RECORDING' },
        data: { recordingStatus: 'FAILED' },
      });
      expect(fs.existsSync(raw(CO_FILE))).toBe(false);
    });

    it('leaves the files when another server gave the recording up first', async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([
        running({ recordingParts: [] }),
      ]);
      stored = [{ role: 'COHOST', file: CO_FILE, status: 'DONE' }];
      prisma.liveStream.updateMany.mockResolvedValue({ count: 0 });
      fs.writeFileSync(raw(CO_FILE), 'raw');
      await service.check(NOW);
      expect(fs.existsSync(raw(CO_FILE))).toBe(true);
    });

    it('gives up a part whose job was never answered for', async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([
        running({
          recordingParts: [
            hostPart({ egressId: null, startedAt: minutesAgo(3) }),
            coPart({ egressId: null, startedAt: minutesAgo(1) }),
          ],
        }),
        running({
          id: 's2',
          recordingParts: [
            hostPart({ id: 'P_2', egressId: null, startedAt: minutesAgo(3) }),
          ],
        }),
      ]);
      sdk.listEgress.mockResolvedValue([{ egressId: 'EG_LATE' }]);
      fs.writeFileSync(raw(HOST_FILE), 'raw');
      fs.writeFileSync(raw(CO_FILE), 'raw');
      // s2's part was given up by another server first.
      prisma.liveRecordingPart.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await service.check(NOW);

      expect(prisma.liveRecordingPart.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.liveRecordingPart.updateMany).toHaveBeenCalledWith({
        where: { id: 'P_HOST', status: 'RECORDING', egressId: null },
        data: { status: 'FAILED', endedAt: expect.any(Date) },
      });
      // Only the one given up here has its stray jobs stopped.
      expect(sdk.listEgress).toHaveBeenCalledTimes(1);
      expect(sdk.listEgress).toHaveBeenCalledWith({
        roomName: 's1',
        active: true,
      });
      expect(sdk.stopEgress).toHaveBeenCalledWith('EG_LATE');
      expect(fs.existsSync(raw(HOST_FILE))).toBe(false);
      expect(fs.existsSync(raw(CO_FILE))).toBe(true);
    });

    it('gives up a part the recorder no longer knows, an hour after the broadcast', async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([
        running({ status: 'ENDED', endedAt: minutesAgo(61) }),
        running({
          id: 's2',
          status: 'ENDED',
          endedAt: minutesAgo(5),
          recordingParts: [hostPart({ id: 'P_2' })],
        }),
        // Still on air: given up an hour past its longest.
        running({
          id: 's3',
          recordingStartedAt: minutesAgo(301),
          recordingParts: [hostPart({ id: 'P_3' })],
        }),
        running({
          id: 's4',
          recordingStartedAt: null,
          recordingParts: [hostPart({ id: 'P_4' })],
        }),
      ]);
      await service.check(NOW);
      const given = prisma.liveRecordingPart.updateMany.mock.calls.map(
        ([args]) => (args as { where: { id: string } }).where.id,
      );
      expect(given).toEqual(['P_HOST', 'P_3', 'P_4']);
    });

    it('never runs two checks at once on one server', async () => {
      let release: (rows: unknown[]) => void = () => {};
      prisma.liveStream.findMany.mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      const first = service.check(NOW);
      expect(await service.check(NOW)).toBe(0);
      expect(prisma.liveStream.findMany).toHaveBeenCalledTimes(1);
      release([]);
      await first;
      await service.check(NOW);
      // Two reads a check: the running recordings, then those waiting.
      expect(prisma.liveStream.findMany).toHaveBeenCalledTimes(4);
    });

    it('goes on with the others when one cannot be checked', async () => {
      prisma.liveStream.findMany.mockResolvedValueOnce([
        running(),
        running({ id: 's2', recordingParts: [hostPart({ egressId: 'EG_2' })] }),
      ]);
      sdk.listEgress
        .mockRejectedValueOnce('unreachable')
        .mockResolvedValueOnce([{ status: EgressStatus.EGRESS_ACTIVE }]);
      stored = [doneHost];
      const warn = warnings();
      expect(await service.check(NOW)).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('never throws out of the schedule', async () => {
      prisma.liveStream.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.check()).resolves.toBe(0);
    });
  });
});
