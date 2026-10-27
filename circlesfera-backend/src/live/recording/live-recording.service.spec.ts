import type { ConfigService } from '@nestjs/config';
import { EgressStatus } from 'livekit-server-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { LiveRecordingService } from './live-recording.service.js';

const sdk = vi.hoisted(() => ({
  createRoom: vi.fn(),
  startRoomCompositeEgress: vi.fn(),
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
        startRoomCompositeEgress: sdk.startRoomCompositeEgress,
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

describe('LiveRecordingService', () => {
  let settings: Record<string, string | undefined>;
  let tx: {
    $executeRaw: ReturnType<typeof vi.fn>;
    liveStream: {
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    liveStream: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let service: LiveRecordingService;

  beforeEach(() => {
    vi.clearAllMocks();
    sdk.hosts.length = 0;
    settings = {
      LIVE_RECORDING_ENABLED: 'true',
      LIVEKIT_URL: 'wss://live.example.com',
      LIVEKIT_API_KEY: 'key',
      LIVEKIT_API_SECRET: 'secret',
    };
    tx = {
      $executeRaw: vi.fn(async () => 1),
      liveStream: { count: vi.fn(async () => 0), update: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
      liveStream: {
        findUnique: vi.fn(),
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    sdk.createRoom.mockResolvedValue({});
    sdk.startRoomCompositeEgress.mockResolvedValue({ egressId: 'EG_1' });
    sdk.stopEgress.mockResolvedValue({});
    sdk.listEgress.mockResolvedValue([]);
    service = new LiveRecordingService(
      prisma as unknown as PrismaService,
      { get: (key: string) => settings[key] } as unknown as ConfigService,
    );
  });

  describe('start', () => {
    it('does nothing where the environment has no recorder of its own', async () => {
      settings.LIVE_RECORDING_ENABLED = undefined;
      await service.start('s1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(sdk.startRoomCompositeEgress).not.toHaveBeenCalled();
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
        await service.start('s1');
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('takes a place under the lock and records the room upright to one MP4 file', async () => {
      await service.start('s1');

      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(tx.liveStream.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: {
          recordingStatus: 'RECORDING',
          recordingStartedAt: expect.any(Date),
        },
      });
      expect(sdk.createRoom).toHaveBeenCalledWith({
        name: 's1',
        emptyTimeout: 300,
      });
      const [room, output, options] =
        sdk.startRoomCompositeEgress.mock.calls[0];
      expect(room).toBe('s1');
      expect(output.file.filepath).toBe('/out/live-s1.mp4');
      expect(options.encodingOptions).toMatchObject({
        width: 720,
        height: 1280,
        framerate: 30,
        videoBitrate: 1500,
        audioBitrate: 96,
        keyFrameInterval: 2,
      });
      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', recordingStatus: 'RECORDING' },
        data: { egressId: 'EG_1' },
      });
      // The browsers' address, asked over https.
      expect(sdk.hosts).toEqual(['https://live.example.com']);
    });

    it('asks the API at its own address when one is set', async () => {
      settings.LIVEKIT_API_URL = 'http://livekit:7880';
      await service.start('s1');
      expect(sdk.hosts).toEqual(['http://livekit:7880']);
    });

    it('marks the broadcast as not recorded when three recordings already run', async () => {
      tx.liveStream.count.mockResolvedValue(3);
      await service.start('s1');
      expect(tx.liveStream.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { recordingStatus: 'SKIPPED_LIMIT' },
      });
      expect(sdk.startRoomCompositeEgress).not.toHaveBeenCalled();
    });

    it('leaves the broadcast as it is when no place can be taken', async () => {
      prisma.$transaction.mockRejectedValue(new Error('db down'));
      await expect(service.start('s1')).resolves.toBeUndefined();
      expect(sdk.startRoomCompositeEgress).not.toHaveBeenCalled();
    });

    it('marks the recording failed when the recorder refuses it', async () => {
      sdk.startRoomCompositeEgress.mockRejectedValue('no recorder');
      await expect(service.start('s1')).resolves.toBeUndefined();
      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', recordingStatus: 'RECORDING' },
        data: { recordingStatus: 'FAILED' },
      });
    });

    it('does not throw when even marking the failure fails', async () => {
      sdk.createRoom.mockRejectedValue(new Error('no live service'));
      prisma.liveStream.updateMany.mockRejectedValue(new Error('db down'));
      await expect(service.start('s1')).resolves.toBeUndefined();
    });
  });

  describe('stop', () => {
    it('does nothing where recording is off', async () => {
      settings.LIVE_RECORDING_ENABLED = 'false';
      await service.stop('s1');
      expect(prisma.liveStream.findUnique).not.toHaveBeenCalled();
    });

    it('stops the recorder job of a running recording', async () => {
      prisma.liveStream.findUnique.mockResolvedValue({
        egressId: 'EG_1',
        recordingStatus: 'RECORDING',
      });
      await service.stop('s1');
      expect(sdk.stopEgress).toHaveBeenCalledWith('EG_1');
    });

    it.each([
      [null],
      [{ egressId: null, recordingStatus: 'RECORDING' }],
      [{ egressId: 'EG_1', recordingStatus: 'SKIPPED_LIMIT' }],
    ])('stops nothing that is not a running recording (%o)', async (row) => {
      prisma.liveStream.findUnique.mockResolvedValue(row);
      await service.stop('s1');
      expect(sdk.stopEgress).not.toHaveBeenCalled();
    });

    it('does not throw when the recorder cannot be reached', async () => {
      prisma.liveStream.findUnique.mockResolvedValue({
        egressId: 'EG_1',
        recordingStatus: 'RECORDING',
      });
      sdk.stopEgress.mockRejectedValue(new Error('unreachable'));
      await expect(service.stop('s1')).resolves.toBeUndefined();
    });
  });

  describe('check', () => {
    const running = (over: Record<string, unknown> = {}) => ({
      id: 's1',
      status: 'LIVE',
      endedAt: null,
      egressId: 'EG_1',
      recordingStartedAt: minutesAgo(10),
      ...over,
    });
    const fileOf = (over: Record<string, unknown> = {}) => ({
      filename: '/out/live-s1.mp4',
      size: 1_000_000n,
      duration: 90_000_000_000n,
      ...over,
    });

    it('does nothing where recording is off', async () => {
      settings.LIVE_RECORDING_ENABLED = undefined;
      expect(await service.check(NOW)).toBe(0);
      expect(prisma.liveStream.findMany).not.toHaveBeenCalled();
    });

    it('leaves a recording of a broadcast still on air', async () => {
      prisma.liveStream.findMany.mockResolvedValue([running()]);
      sdk.listEgress.mockResolvedValue([
        { status: EgressStatus.EGRESS_ACTIVE, fileResults: [] },
      ]);
      expect(await service.check(NOW)).toBe(0);
      expect(sdk.listEgress).toHaveBeenCalledWith({ egressId: 'EG_1' });
      expect(sdk.stopEgress).not.toHaveBeenCalled();
      expect(prisma.liveStream.updateMany).not.toHaveBeenCalled();
    });

    it('stops the recording of a broadcast that ended', async () => {
      prisma.liveStream.findMany.mockResolvedValue([
        running({ status: 'ENDED', endedAt: minutesAgo(1) }),
      ]);
      sdk.listEgress.mockResolvedValue([
        { status: EgressStatus.EGRESS_STARTING, fileResults: [] },
      ]);
      await service.check(NOW);
      expect(sdk.stopEgress).toHaveBeenCalledWith('EG_1');
    });

    it('stops a recording at four hours while the broadcast goes on', async () => {
      prisma.liveStream.findMany.mockResolvedValue([
        running({ recordingStartedAt: minutesAgo(240) }),
      ]);
      sdk.listEgress.mockResolvedValue([
        { status: EgressStatus.EGRESS_ACTIVE, fileResults: [] },
      ]);
      await service.check(NOW);
      expect(sdk.stopEgress).toHaveBeenCalledWith('EG_1');
    });

    it('leaves a recording the recorder is closing', async () => {
      prisma.liveStream.findMany.mockResolvedValue([running()]);
      sdk.listEgress.mockResolvedValue([
        { status: EgressStatus.EGRESS_ENDING, fileResults: [] },
      ]);
      expect(await service.check(NOW)).toBe(0);
      expect(prisma.liveStream.updateMany).not.toHaveBeenCalled();
    });

    it.each([EgressStatus.EGRESS_COMPLETE, EgressStatus.EGRESS_LIMIT_REACHED])(
      'takes the file of a finished recording (status %s)',
      async (status) => {
        prisma.liveStream.findMany.mockResolvedValue([running()]);
        sdk.listEgress.mockResolvedValue([{ status, fileResults: [fileOf()] }]);
        expect(await service.check(NOW)).toBe(1);
        expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
          where: { id: 's1', egressId: 'EG_1', recordingStatus: 'RECORDING' },
          data: {
            recordingStatus: 'PROCESSING',
            recordingFile: 'live-s1.mp4',
            recordingDurationMs: 90_000,
            recordingSizeBytes: 1_000_000n,
          },
        });
      },
    );

    it('counts nothing when another server took the file first', async () => {
      prisma.liveStream.findMany.mockResolvedValue([running()]);
      sdk.listEgress.mockResolvedValue([
        { status: EgressStatus.EGRESS_COMPLETE, fileResults: [fileOf()] },
      ]);
      prisma.liveStream.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.check(NOW)).toBe(0);
    });

    it.each([
      ['no file', []],
      ['an empty file', [fileOf({ size: 0n })]],
      ['a file of another name', [fileOf({ filename: '/out/other.mp4' })]],
    ])('marks failed a finished recording with %s', async (_label, files) => {
      prisma.liveStream.findMany.mockResolvedValue([running()]);
      sdk.listEgress.mockResolvedValue([
        { status: EgressStatus.EGRESS_COMPLETE, fileResults: files },
      ]);
      expect(await service.check(NOW)).toBe(0);
      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', recordingStatus: 'RECORDING', egressId: 'EG_1' },
        data: { recordingStatus: 'FAILED' },
      });
    });

    it.each([EgressStatus.EGRESS_FAILED, EgressStatus.EGRESS_ABORTED])(
      'marks failed a recording the recorder gave up (status %s)',
      async (status) => {
        prisma.liveStream.findMany.mockResolvedValue([running()]);
        sdk.listEgress.mockResolvedValue([
          { status, fileResults: [], error: 'boom' },
        ]);
        await service.check(NOW);
        expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
          where: { id: 's1', recordingStatus: 'RECORDING', egressId: 'EG_1' },
          data: { recordingStatus: 'FAILED' },
        });
      },
    );

    it('gives up a recording whose job was never answered for', async () => {
      prisma.liveStream.findMany.mockResolvedValue([
        running({ egressId: null, recordingStartedAt: minutesAgo(3) }),
        running({
          id: 's2',
          egressId: null,
          recordingStartedAt: minutesAgo(1),
        }),
        running({ id: 's3', egressId: null, recordingStartedAt: null }),
      ]);
      await service.check(NOW);
      expect(sdk.listEgress).not.toHaveBeenCalled();
      expect(prisma.liveStream.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', recordingStatus: 'RECORDING', egressId: null },
        data: { recordingStatus: 'FAILED' },
      });
    });

    it('gives up a recording the recorder no longer knows, an hour after the broadcast', async () => {
      prisma.liveStream.findMany.mockResolvedValue([
        running({ status: 'ENDED', endedAt: minutesAgo(61) }),
        running({ id: 's2', status: 'ENDED', endedAt: minutesAgo(5) }),
        // Still on air: given up an hour past its longest.
        running({ id: 's3', recordingStartedAt: minutesAgo(301) }),
      ]);
      await service.check(NOW);
      expect(prisma.liveStream.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.liveStream.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 's2' }),
        }),
      );
    });

    it('goes on with the others when one cannot be checked', async () => {
      prisma.liveStream.findMany.mockResolvedValue([
        running(),
        running({ id: 's2', egressId: 'EG_2' }),
      ]);
      sdk.listEgress
        .mockRejectedValueOnce('unreachable')
        .mockResolvedValueOnce([
          {
            status: EgressStatus.EGRESS_COMPLETE,
            fileResults: [fileOf({ filename: '/out/live-s2.mp4' })],
          },
        ]);
      expect(await service.check(NOW)).toBe(1);
    });

    it('never throws out of the schedule', async () => {
      prisma.liveStream.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.check()).resolves.toBe(0);
    });
  });
});
