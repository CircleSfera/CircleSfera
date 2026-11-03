import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppGateway } from '../socket/app.gateway.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { LiveService } from './live.service.js';
import { listedForViewer } from './live-audience.js';
import { LiveKitTokenService } from './live-kit-token.service.js';
import { LiveRecordingService } from './recording/live-recording.service.js';

// Loosely typed, as each test answers in its own shape.
type AnyFn = (...args: any[]) => any;
type GuestStatus = 'INVITED' | 'ON_AIR' | 'DECLINED' | 'LEFT' | 'REMOVED';
interface GuestRow {
  streamId: string;
  profileId: string;
  status: GuestStatus;
  invitedAt: Date;
  joinedAt: Date | null;
  endedAt: Date | null;
}

// The guests of lives, kept as the table would: rows matched on their own
// fields (a filter on a relation is left to each test).
let guests: GuestRow[] = [];
const seedGuest = (
  streamId: string,
  profileId: string,
  status: GuestStatus,
  over: Partial<GuestRow> = {},
) => {
  guests.push({
    streamId,
    profileId,
    status,
    invitedAt: new Date(0),
    joinedAt: status === 'ON_AIR' ? new Date(0) : null,
    endedAt: null,
    ...over,
  });
};
const statusOf = (streamId: string, profileId: string) =>
  guests.find((row) => row.streamId === streamId && row.profileId === profileId)
    ?.status;
const matches = (row: GuestRow, where: Record<string, unknown> = {}) =>
  (['streamId', 'profileId', 'status'] as const).every((field) => {
    const wanted = where[field];
    if (wanted === undefined) return true;
    if (wanted && typeof wanted === 'object' && 'in' in wanted) {
      return (wanted.in as string[]).includes(row[field]);
    }
    return row[field] === wanted;
  });
const byKey = (key: { streamId: string; profileId: string }) =>
  guests.find(
    (row) => row.streamId === key.streamId && row.profileId === key.profileId,
  );
const withProfile = (row: GuestRow) => ({
  ...row,
  profile: { username: `${row.profileId}_name`, avatar: null },
});
const liveGuestFindUnique = async ({
  where,
}: {
  where: { streamId_profileId: { streamId: string; profileId: string } };
}) => {
  const row = byKey(where.streamId_profileId);
  return row ? withProfile(row) : null;
};

describe('LiveService', () => {
  let service: LiveService;

  const mockServer = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  };

  const mockGateway = {
    server: mockServer,
  };

  const mockPrismaService = {
    user: { findMany: vi.fn().mockResolvedValue([]) },
    block: { findFirst: vi.fn().mockResolvedValue(null) },
    closeFriend: { findUnique: vi.fn().mockResolvedValue(null) },
    liveStream: {
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn<AnyFn>(async () => []),
    },
    liveGuest: {
      findMany: vi.fn<AnyFn>(
        async ({ where }: { where: Record<string, unknown> }) =>
          guests.filter((row) => matches(row, where)).map(withProfile),
      ),
      findFirst: vi.fn<AnyFn>(
        async ({ where }: { where: Record<string, unknown> }) =>
          guests.find((row) => matches(row, where)) ?? null,
      ),
      findUnique: vi.fn<AnyFn>(liveGuestFindUnique),
      updateMany: vi.fn<AnyFn>(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<GuestRow>;
        }) => {
          const hit = guests.filter((row) => matches(row, where));
          for (const row of hit) Object.assign(row, data);
          return { count: hit.length };
        },
      ),
      update: vi.fn<AnyFn>(
        async ({
          where,
          data,
        }: {
          where: {
            streamId_profileId: { streamId: string; profileId: string };
          };
          data: Partial<GuestRow>;
        }) => Object.assign(byKey(where.streamId_profileId) as GuestRow, data),
      ),
      upsert: vi.fn<AnyFn>(
        async ({
          where,
          create,
          update,
        }: {
          where: {
            streamId_profileId: { streamId: string; profileId: string };
          };
          create: GuestRow;
          update: Partial<GuestRow>;
        }) => {
          const row = byKey(where.streamId_profileId);
          if (row) return Object.assign(row, update);
          const made: GuestRow = { ...create };
          guests.push(made);
          return made;
        },
      ),
    },
    $queryRaw: vi.fn(async () => []),
    profile: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(mockPrismaService)),
  };

  const mockRecording = {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    startCoHost: vi.fn(async () => undefined),
    stopCoHost: vi.fn(async () => undefined),
    closeRoom: vi.fn(async () => undefined),
    removeFromRoom: vi.fn(async () => undefined),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'LIVEKIT_API_KEY') return 'test_key';
      if (key === 'LIVEKIT_API_SECRET')
        return 'test_secret_32_bytes_long_key_mock_secret!';
      if (key === 'NODE_ENV') return 'test';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppGateway, useValue: mockGateway },
        {
          provide: SystemSettingsService,
          useValue: { isEnabled: vi.fn(async () => true) },
        },
        { provide: LiveRecordingService, useValue: mockRecording },
        {
          provide: LiveKitTokenService,
          useValue: new LiveKitTokenService(
            mockConfigService as unknown as ConfigService,
          ),
        },
      ],
    }).compile();

    service = module.get<LiveService>(LiveService);
    vi.clearAllMocks();
    mockServer.to.mockReturnThis();
    guests = [];
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startStream', () => {
    it('should end existing streams and create a new stream with token', async () => {
      const mockStream = {
        id: 'stream-1',
        hostId: 'user-1',
        status: 'LIVE',
        audience: 'EVERYONE',
        title: 'Test Stream',
      };
      mockPrismaService.liveStream.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.liveStream.create.mockResolvedValue(mockStream);

      const result = await service.startStream('user-1', 'Test Stream');

      expect(mockPrismaService.liveStream.updateMany).toHaveBeenCalledWith({
        where: { hostId: 'user-1', status: 'LIVE' },
        data: { status: 'ENDED', endedAt: expect.any(Date) },
      });
      // No live was replaced: no guests to end.
      expect(mockPrismaService.liveGuest.updateMany).not.toHaveBeenCalled();
      expect(result.stream).toEqual(mockStream);
      expect(typeof result.token).toBe('string');
      expect(mockRecording.start).toHaveBeenCalledWith('stream-1', 'user-1');
    });
  });

  describe('who a live is for', () => {
    const shown = {
      isAccountBanned: false,
      suspendedUntil: null,
      user: { isActive: true, deactivatedAt: null },
    };

    it('keeps the audience chosen, and records any live but a practice', async () => {
      for (const audience of [
        'EVERYONE',
        'CLOSE_FRIENDS',
        'PRACTICE',
      ] as const) {
        mockRecording.start.mockClear();
        mockPrismaService.liveStream.create.mockResolvedValue({
          id: `s-${audience}`,
          hostId: 'host-1',
          audience,
        });

        await service.startStream('host-1', 'x', audience);

        expect(mockPrismaService.liveStream.create).toHaveBeenLastCalledWith({
          data: expect.objectContaining({ audience }),
        });
        expect(mockRecording.start).toHaveBeenCalledTimes(
          audience === 'PRACTICE' ? 0 : 1,
        );
      }
    });

    it('is for everyone when not chosen', async () => {
      mockPrismaService.liveStream.create.mockResolvedValue({ id: 's' });

      await service.startStream('host-1', 'x');

      expect(mockPrismaService.liveStream.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ audience: 'EVERYONE' }),
      });
    });

    it('gives no token and no page to whoever it is not for, as if it did not exist', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1',
        hostId: 'host-1',
        status: 'LIVE',
        audience: 'CLOSE_FRIENDS',
        host: shown,
        guests: [],
      });
      mockPrismaService.closeFriend.findUnique.mockResolvedValue(null);

      await expect(
        service.getViewerToken('stream-1', 'user-2', 'outsider'),
      ).rejects.toThrow(AppException);
      await expect(service.getStream('stream-1', 'outsider')).rejects.toThrow(
        AppException,
      );

      mockPrismaService.closeFriend.findUnique.mockResolvedValue({ id: 'cf' });
      await expect(
        service.getViewerToken('stream-1', 'user-3', 'friend'),
      ).resolves.toHaveProperty('token');
    });

    it('lists only lives that are for the viewer', async () => {
      mockPrismaService.liveStream.findMany.mockResolvedValue([]);

      await service.getActiveStreams('viewer-1');

      const [args] =
        mockPrismaService.liveStream.findMany.mock.calls.at(-1) ?? [];
      expect(args.where.AND).toEqual([listedForViewer('viewer-1')]);
    });
  });

  describe('getViewerToken', () => {
    it('should throw NotFoundException if stream does not exist or is ended', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue(null);

      await expect(
        service.getViewerToken('stream-invalid', 'user-2'),
      ).rejects.toThrow(AppException);
    });

    it('should return viewer token for an active live stream', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1',
        status: 'LIVE',
        audience: 'EVERYONE',
        host: {
          isAccountBanned: false,
          suspendedUntil: null,
          user: { isActive: true, deactivatedAt: null },
        },
      });

      const result = await service.getViewerToken('stream-1', 'user-2');
      expect(result).toHaveProperty('token');
      expect(typeof result.token).toBe('string');
    });

    it('refuses a token to a viewer in a block relation with the host', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1',
        status: 'LIVE',
        audience: 'EVERYONE',
        hostId: 'host-1',
        host: {
          isAccountBanned: false,
          suspendedUntil: null,
          user: { isActive: true, deactivatedAt: null },
        },
      });
      mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b1' });

      await expect(
        service.getViewerToken('stream-1', 'user-2', 'viewer-1'),
      ).rejects.toThrow(AppException);
    });

    it.each([
      ['banned', { isAccountBanned: true }],
      ['suspended', { suspendedUntil: new Date(Date.now() + 3600_000) }],
      [
        'with a closed account',
        { user: { isActive: false, deactivatedAt: null } },
      ],
      [
        'with a deactivated account',
        { user: { isActive: true, deactivatedAt: new Date() } },
      ],
    ])('refuses a token to the stream of a host %s', async (_, over) => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1',
        status: 'LIVE',
        audience: 'EVERYONE',
        hostId: 'host-1',
        host: {
          isAccountBanned: false,
          suspendedUntil: null,
          user: { isActive: true, deactivatedAt: null },
          ...over,
        },
      });

      await expect(
        service.getViewerToken('stream-1', 'user-2', 'viewer-1'),
      ).rejects.toMatchObject({ errorCode: 'STREAM_NOT_FOUND' });
    });

    it('gives a token again once a suspension has ended', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1',
        status: 'LIVE',
        audience: 'EVERYONE',
        hostId: 'host-1',
        host: {
          isAccountBanned: false,
          suspendedUntil: new Date(Date.now() - 1000),
          user: { isActive: true, deactivatedAt: null },
        },
      });

      await expect(
        service.getViewerToken('stream-1', 'user-2', 'viewer-1'),
      ).resolves.toHaveProperty('token');
    });

    it('refuses every token while live streams are switched off', async () => {
      const settings = (service as any).systemSettings;
      settings.isEnabled.mockResolvedValueOnce(false);

      await expect(
        service.getViewerToken('stream-1', 'user-2', 'viewer-1'),
      ).rejects.toThrow('LIVE_STREAMS_DISABLED');
      expect(mockPrismaService.liveStream.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('endStream', () => {
    it('ends each live stream, sets no replay address and stops its recording', async () => {
      mockPrismaService.liveStream.findMany.mockResolvedValue([
        { id: 'stream-1', hostId: 'user-1', hlsUrl: null },
      ]);
      mockPrismaService.liveStream.update.mockResolvedValue({
        id: 'stream-1',
        status: 'ENDED',
      });

      const result = await service.endStream('user-1');
      expect(mockPrismaService.liveStream.update).toHaveBeenCalledWith({
        where: { id: 'stream-1' },
        data: { status: 'ENDED', endedAt: expect.any(Date) },
      });
      expect(mockRecording.stop).toHaveBeenCalledWith('stream-1');
      expect(result).toEqual({ success: true, endedCount: 1 });
    });
  });

  describe('getActiveStreams', () => {
    it('should return active streams with host.profile for the feed', async () => {
      mockPrismaService.liveStream.findMany.mockResolvedValue([
        {
          id: 'stream-1',
          status: 'LIVE',
          audience: 'EVERYONE',
          host: { id: 'host-profile-1', username: 'alice', avatar: null },
          guests: [],
        },
      ]);

      const result = await service.getActiveStreams();
      expect(result).toEqual([
        {
          id: 'stream-1',
          status: 'LIVE',
          audience: 'EVERYONE',
          host: {
            id: 'host-profile-1',
            profile: { username: 'alice', avatar: null },
          },
          guests: [],
          coHostId: null,
          coHost: null,
        },
      ]);
    });
  });

  describe('which streams are shown', () => {
    const shownHost = {
      id: 'host-1',
      username: 'alice',
      avatar: null,
      isAccountBanned: false,
      suspendedUntil: null,
      user: { isActive: true, deactivatedAt: null },
    };

    it('lists only streams of hosts that are not banned, suspended or closed', async () => {
      mockPrismaService.liveStream.findMany.mockResolvedValue([]);

      await service.getActiveStreams();

      const [args] =
        mockPrismaService.liveStream.findMany.mock.calls.at(-1) ?? [];
      const where = args.where;
      expect(where.status).toBe('LIVE');
      expect(where.host.AND[0]).toEqual({
        isAccountBanned: false,
        OR: [
          { suspendedUntil: null },
          { suspendedUntil: { lt: expect.any(Date) } },
        ],
        user: { isActive: true, deactivatedAt: null },
      });
    });

    it("shows a stream of a host that may be seen, without the host's account state", async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1',
        hostId: 'host-1',
        status: 'LIVE',
        audience: 'EVERYONE',
        host: shownHost,
        guests: [],
      });

      const stream = await service.getStream('stream-1', 'viewer-1');

      expect(stream.host).toEqual({
        id: 'host-1',
        profile: { username: 'alice', avatar: null },
      });
      expect(stream.coHost).toBeNull();
      expect(stream.guests).toEqual([]);
    });

    it('a stream of a banned host is not found', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1',
        hostId: 'host-1',
        status: 'LIVE',
        audience: 'EVERYONE',
        host: { ...shownHost, isAccountBanned: true },
        guests: [],
      });

      await expect(
        service.getStream('stream-1', 'viewer-1'),
      ).rejects.toMatchObject({ errorCode: 'STREAM_NOT_FOUND' });
    });

    it('a stream that does not exist is not found', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue(null);

      await expect(
        service.getStream('stream-1', 'viewer-1'),
      ).rejects.toMatchObject({ errorCode: 'STREAM_NOT_FOUND' });
    });
  });

  describe('when a host is sanctioned', () => {
    const live = (host: Record<string, unknown>, id = 'stream-1') => ({
      id,
      host: {
        isAccountBanned: false,
        suspendedUntil: null,
        user: { isRootBanned: false },
        ...host,
      },
    });

    it("a banned host's broadcast ends as ended by staff and its room is closed", async () => {
      mockPrismaService.liveStream.findMany.mockResolvedValueOnce([
        live({ isAccountBanned: true }),
      ]);

      await service.endBroadcastsOfSanctionedHost({
        userId: 'user-1',
        reason: 'Account banned by administration',
      });

      const [args] = mockPrismaService.liveStream.findMany.mock.calls[0] ?? [];
      expect(args.where.status).toBe('LIVE');
      expect(args.where.host.userId).toBe('user-1');
      expect(args.where.host.NOT).toMatchObject({ isAccountBanned: false });
      expect(mockPrismaService.liveStream.update).toHaveBeenCalledWith({
        where: { id: 'stream-1' },
        data: {
          status: 'ENDED',
          endedAt: expect.any(Date),
          endedByStaff: true,
        },
      });
      expect(mockRecording.stop).toHaveBeenCalledWith('stream-1');
      expect(mockRecording.closeRoom).toHaveBeenCalledWith('stream-1');
    });

    it("a suspended host's broadcast also ends as ended by staff", async () => {
      mockPrismaService.liveStream.findMany.mockResolvedValueOnce([
        live({ suspendedUntil: new Date(Date.now() + 3600_000) }),
      ]);

      await service.endBroadcastsOfSanctionedHost({ userId: 'user-1' });

      expect(mockPrismaService.liveStream.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ endedByStaff: true }),
        }),
      );
    });

    it('an account closed or being deleted ends the broadcast as the host would, keeping its replay', async () => {
      mockPrismaService.liveStream.findMany.mockResolvedValueOnce([live({})]);

      await service.endBroadcastsOfSanctionedHost({
        userId: 'user-1',
        reason: 'Account scheduled for deletion',
      });

      expect(mockPrismaService.liveStream.update).toHaveBeenCalledWith({
        where: { id: 'stream-1' },
        data: {
          status: 'ENDED',
          endedAt: expect.any(Date),
          endedByStaff: false,
        },
      });
      expect(mockRecording.closeRoom).toHaveBeenCalledWith('stream-1');
    });

    it('a sanctioned guest is removed from every live where it has a place, which go on', async () => {
      const emit = mockServer.emit;
      seedGuest('stream-2', 'guest-1', 'ON_AIR');
      seedGuest('stream-3', 'guest-1', 'INVITED');
      seedGuest('stream-2', 'guest-2', 'ON_AIR');
      mockPrismaService.liveStream.findMany.mockResolvedValueOnce([]);
      mockPrismaService.liveGuest.findMany.mockImplementationOnce(async () =>
        guests
          .filter((row) => row.profileId === 'guest-1')
          .map(({ streamId, profileId }) => ({ streamId, profileId })),
      );

      await service.endBroadcastsOfSanctionedHost({
        userId: 'user-1',
        profileId: 'guest-1',
        scope: 'profile',
      });

      const [args] = mockPrismaService.liveGuest.findMany.mock.calls[0] ?? [];
      expect(args.where).toEqual({
        status: { in: ['INVITED', 'ON_AIR'] },
        profile: expect.objectContaining({ id: 'guest-1' }),
        stream: { status: 'LIVE' },
      });
      expect(statusOf('stream-2', 'guest-1')).toBe('REMOVED');
      expect(statusOf('stream-3', 'guest-1')).toBe('REMOVED');
      // The other guest stays on air.
      expect(statusOf('stream-2', 'guest-2')).toBe('ON_AIR');
      // Only the guest who was on air is taken out of the room.
      expect(mockRecording.stopCoHost.mock.calls).toEqual([
        ['stream-2', 'guest-1'],
      ]);
      expect(mockRecording.removeFromRoom.mock.calls).toEqual([
        ['stream-2', 'guest-1'],
      ]);
      expect(mockRecording.closeRoom).not.toHaveBeenCalled();
      expect(mockServer.to).toHaveBeenCalledWith('user:guest-1');
      expect(emit).toHaveBeenCalledWith('live:guest_removed', {
        streamId: 'stream-2',
      });
      expect(emit).toHaveBeenCalledWith('live:cohost_removed', {
        streamId: 'stream-2',
      });
      // Told before being taken out of the room.
      const told = emit.mock.calls.findIndex(
        ([name]: unknown[]) => name === 'live:guest_removed',
      );
      expect(emit.mock.invocationCallOrder[told]).toBeLessThan(
        mockRecording.removeFromRoom.mock.invocationCallOrder[0],
      );
      expect(emit).toHaveBeenCalledWith('live:cohost_left', {
        coHostId: 'guest-1',
      });
    });

    it('a ban of the whole account ends the broadcast as ended by staff', async () => {
      mockPrismaService.liveStream.findMany.mockResolvedValueOnce([
        live({ user: { isRootBanned: true } }),
      ]);

      await service.endBroadcastsOfSanctionedHost({
        userId: 'user-1',
        reason: 'Account banned by administration',
      });

      const [args] = mockPrismaService.liveStream.findMany.mock.calls[0] ?? [];
      expect(args.select.host.select.user).toEqual({
        select: { isRootBanned: true },
      });
      expect(mockPrismaService.liveStream.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ endedByStaff: true }),
        }),
      );
    });

    it("the guests of a sanctioned host's broadcast are out of it", async () => {
      seedGuest('stream-1', 'guest-1', 'ON_AIR');
      seedGuest('stream-1', 'guest-2', 'DECLINED');
      mockPrismaService.liveStream.findMany.mockResolvedValueOnce([
        live({ isAccountBanned: true }),
      ]);
      mockPrismaService.liveGuest.findMany.mockResolvedValueOnce([]);

      await service.endBroadcastsOfSanctionedHost({ userId: 'user-1' });

      expect(statusOf('stream-1', 'guest-1')).toBe('LEFT');
      expect(statusOf('stream-1', 'guest-2')).toBe('DECLINED');
    });

    it('leaves a guest who left meanwhile as they are', async () => {
      seedGuest('stream-2', 'guest-1', 'ON_AIR');
      mockPrismaService.liveStream.findMany.mockResolvedValueOnce([]);
      mockPrismaService.liveGuest.findMany.mockResolvedValueOnce([
        { streamId: 'stream-2', profileId: 'guest-1' },
      ]);
      mockPrismaService.liveGuest.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      await service.endBroadcastsOfSanctionedHost({
        userId: 'user-1',
        profileId: 'guest-1',
        scope: 'profile',
      });

      expect(mockRecording.stopCoHost).not.toHaveBeenCalled();
      expect(mockRecording.removeFromRoom).not.toHaveBeenCalled();
    });

    it('one broadcast that fails to end leaves the others to end, and guests are still taken off', async () => {
      seedGuest('stream-c', 'guest-1', 'ON_AIR');
      seedGuest('stream-d', 'guest-1', 'ON_AIR');
      mockPrismaService.liveStream.findMany.mockResolvedValueOnce([
        live({ isAccountBanned: true }, 'stream-a'),
        live({ isAccountBanned: true }, 'stream-b'),
      ]);
      mockPrismaService.liveGuest.findMany.mockResolvedValueOnce([
        { streamId: 'stream-c', profileId: 'guest-1' },
        { streamId: 'stream-d', profileId: 'guest-1' },
      ]);
      mockPrismaService.liveStream.update.mockRejectedValueOnce(
        new Error('db busy'),
      );
      mockRecording.stopCoHost.mockRejectedValueOnce(new Error('recorder'));

      await service.endBroadcastsOfSanctionedHost({ userId: 'user-1' });

      expect(mockRecording.closeRoom).toHaveBeenCalledTimes(1);
      expect(mockRecording.closeRoom).toHaveBeenCalledWith('stream-b');
      expect(mockRecording.removeFromRoom).toHaveBeenCalledTimes(1);
      expect(mockRecording.removeFromRoom).toHaveBeenCalledWith(
        'stream-d',
        'guest-1',
      );
    });

    it("for a sanction of one Profile, looks only at that Profile's broadcasts", async () => {
      mockPrismaService.liveStream.findMany.mockResolvedValue([]);

      await service.endBroadcastsOfSanctionedHost({
        userId: 'user-1',
        profileId: 'host-1',
        scope: 'profile',
      });

      const [args] = mockPrismaService.liveStream.findMany.mock.calls[0] ?? [];
      expect(args.where.host.id).toBe('host-1');
      expect(args.where.host.userId).toBeUndefined();
      expect(mockRecording.closeRoom).not.toHaveBeenCalled();
    });

    it('a failure is logged and does not reach the one who ended the sessions', async () => {
      mockPrismaService.liveStream.findMany.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(
        service.endBroadcastsOfSanctionedHost({ userId: 'user-1' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('while live streams are switched off', () => {
    it('nobody is invited to be a guest, and no invitation is accepted', async () => {
      const settings = (service as any).systemSettings;
      settings.isEnabled.mockResolvedValue(false);

      await expect(
        service.inviteGuest('stream-1', 'host-1', { profileId: 'p2' }),
      ).rejects.toThrow('LIVE_STREAMS_DISABLED');
      await expect(service.acceptGuestInvite('stream-1', 'p2')).rejects.toThrow(
        'LIVE_STREAMS_DISABLED',
      );
      expect(mockPrismaService.liveStream.findUnique).not.toHaveBeenCalled();

      settings.isEnabled.mockResolvedValue(true);
    });
  });

  describe('guests', () => {
    const HOST = 'host-profile-1';
    const onAirLive = (over: Record<string, unknown> = {}) => ({
      id: 'stream-1',
      hostId: HOST,
      status: 'LIVE',
      title: 'Live!',
      ...over,
    });
    // The invitee is the Profile named; the host is found too.
    const profilesFound = (inviteeId: string | null) => {
      mockPrismaService.profile.findFirst.mockResolvedValue(
        inviteeId ? { id: inviteeId, username: `${inviteeId}_name` } : null,
      );
      mockPrismaService.profile.findUnique.mockImplementation(
        async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          username: `${where.id}_name`,
          avatar: null,
        }),
      );
    };
    const emitted = (event: string) =>
      mockServer.emit.mock.calls.filter(([name]: unknown[]) => name === event);

    beforeEach(() => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue(onAirLive());
    });

    describe('inviting', () => {
      it('invites a Profile, tells them and the room, and answers the guests', async () => {
        profilesFound('ana');

        const result = await service.inviteGuest('stream-1', HOST, {
          profileId: 'ana',
        });

        expect(mockPrismaService.profile.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'ana' } }),
        );
        // The count of places is read with the live locked.
        expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
        expect(statusOf('stream-1', 'ana')).toBe('INVITED');
        expect(mockServer.to).toHaveBeenCalledWith('user:ana');
        const host = { id: HOST, username: `${HOST}_name`, avatar: null };
        expect(mockServer.emit).toHaveBeenCalledWith('live:guest_invite', {
          streamId: 'stream-1',
          streamTitle: 'Live!',
          host,
        });
        expect(mockServer.emit).toHaveBeenCalledWith('live:cohost_invite', {
          streamId: 'stream-1',
          streamTitle: 'Live!',
          host,
        });
        const guestList = [
          {
            profileId: 'ana',
            username: 'ana_name',
            avatar: null,
            status: 'INVITED',
          },
        ];
        // The room is told nobody new is on air: an invite is between the
        // host and the invitee.
        expect(mockServer.to).toHaveBeenCalledWith('live:stream-1');
        expect(emitted('live:guests_changed')).toEqual([
          ['live:guests_changed', { streamId: 'stream-1', guests: [] }],
        ]);
        // The host alone is told who is invited.
        expect(mockServer.to).toHaveBeenCalledWith(`user:${HOST}`);
        expect(emitted('live:guest_invites')).toEqual([
          ['live:guest_invites', { streamId: 'stream-1', guests: guestList }],
        ]);
        // An invite is not being on air.
        expect(emitted('live:cohost_joined')).toEqual([]);
        expect(result).toEqual({
          success: true,
          profileId: 'ana',
          guests: guestList,
        });
      });

      it('invites the first Profile of a person when the person is named', async () => {
        profilesFound('ana');

        await service.inviteGuest('stream-1', HOST, { userId: 'user-2' });

        expect(mockPrismaService.profile.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { userId: 'user-2' },
            orderBy: { createdAt: 'asc' },
          }),
        );
        expect(statusOf('stream-1', 'ana')).toBe('INVITED');
      });

      it('takes up to three guests, and refuses a fourth without taking anyone off', async () => {
        seedGuest('stream-1', 'ana', 'ON_AIR');
        seedGuest('stream-1', 'bea', 'ON_AIR');
        seedGuest('stream-1', 'cai', 'INVITED');
        // Those out of the live take no place.
        seedGuest('stream-1', 'old', 'LEFT');
        profilesFound('dan');

        await expect(
          service.inviteGuest('stream-1', HOST, { profileId: 'dan' }),
        ).rejects.toMatchObject({ errorCode: 'LIVE_GUESTS_FULL' });

        expect(statusOf('stream-1', 'dan')).toBeUndefined();
        expect(statusOf('stream-1', 'ana')).toBe('ON_AIR');
        expect(statusOf('stream-1', 'bea')).toBe('ON_AIR');
        expect(statusOf('stream-1', 'cai')).toBe('INVITED');
        expect(mockRecording.stopCoHost).not.toHaveBeenCalled();
        expect(mockRecording.removeFromRoom).not.toHaveBeenCalled();
        expect(mockServer.emit).not.toHaveBeenCalled();
      });

      it('invites a third guest while two are on air, who stay on air', async () => {
        seedGuest('stream-1', 'ana', 'ON_AIR');
        seedGuest('stream-1', 'bea', 'ON_AIR');
        profilesFound('cai');

        await service.inviteGuest('stream-1', HOST, { profileId: 'cai' });

        expect(statusOf('stream-1', 'cai')).toBe('INVITED');
        expect(statusOf('stream-1', 'ana')).toBe('ON_AIR');
        expect(statusOf('stream-1', 'bea')).toBe('ON_AIR');
        expect(mockRecording.stopCoHost).not.toHaveBeenCalled();
      });

      it('refuses to invite again a Profile already invited or on air', async () => {
        for (const status of ['INVITED', 'ON_AIR'] as const) {
          guests = [];
          seedGuest('stream-1', 'ana', status);
          profilesFound('ana');
          await expect(
            service.inviteGuest('stream-1', HOST, { profileId: 'ana' }),
          ).rejects.toMatchObject({ errorCode: 'LIVE_GUEST_ALREADY_INVITED' });
          expect(statusOf('stream-1', 'ana')).toBe(status);
        }
      });

      it('invites again a Profile who declined, left or was removed, on the same row', async () => {
        for (const status of ['DECLINED', 'LEFT', 'REMOVED'] as const) {
          guests = [];
          seedGuest('stream-1', 'ana', status, {
            joinedAt: new Date(1),
            endedAt: new Date(2),
          });
          profilesFound('ana');

          await service.inviteGuest('stream-1', HOST, { profileId: 'ana' });

          expect(guests).toHaveLength(1);
          expect(guests[0]).toMatchObject({
            status: 'INVITED',
            joinedAt: null,
            endedAt: null,
          });
        }
      });

      it.each([
        ['a live that does not exist', null, HOST, 'ana', 'STREAM_NOT_FOUND'],
        [
          'by anyone but the host',
          onAirLive(),
          'attacker',
          'ana',
          'ONLY_HOST_CAN_INVITE',
        ],
        [
          'to a live that ended',
          onAirLive({ status: 'ENDED' }),
          HOST,
          'ana',
          'STREAM_NOT_ACTIVE',
        ],
        [
          'a Profile that does not exist',
          onAirLive(),
          HOST,
          null,
          'USER_NOT_FOUND',
        ],
        ['the host themself', onAirLive(), HOST, HOST, 'CANNOT_INVITE_SELF'],
      ])(
        'refuses an invite to %s',
        async (_label, stream, caller, invitee, code) => {
          mockPrismaService.liveStream.findUnique.mockResolvedValue(stream);
          profilesFound(invitee);

          await expect(
            service.inviteGuest('stream-1', caller, {
              profileId: invitee ?? 'ghost',
            }),
          ).rejects.toMatchObject({ errorCode: code });
          expect(guests).toEqual([]);
          expect(mockServer.emit).not.toHaveBeenCalled();
        },
      );

      it('finds no Profile to invite across a block', async () => {
        profilesFound('ana');
        mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b-1' });

        await expect(
          service.inviteGuest('stream-1', HOST, { profileId: 'ana' }),
        ).rejects.toMatchObject({ errorCode: 'USER_NOT_FOUND' });
        expect(guests).toEqual([]);
      });

      it('reads the live again once locked: one that ended meanwhile takes no invite', async () => {
        profilesFound('ana');
        mockPrismaService.liveStream.findUnique
          .mockResolvedValueOnce(onAirLive())
          .mockResolvedValueOnce(onAirLive({ status: 'ENDED' }));

        await expect(
          service.inviteGuest('stream-1', HOST, { profileId: 'ana' }),
        ).rejects.toMatchObject({ errorCode: 'STREAM_NOT_ACTIVE' });
      });
    });

    describe('accepting', () => {
      it('puts the invited Profile on air with a token that may publish, recorded as themself', async () => {
        seedGuest('stream-1', 'ana', 'INVITED');
        profilesFound(null);

        const result = await service.acceptGuestInvite('stream-1', 'ana');

        expect(typeof result.token).toBe('string');
        expect(result.streamId).toBe('stream-1');
        const grant = JSON.parse(
          Buffer.from(result.token.split('.')[1], 'base64url').toString(),
        );
        expect(grant.sub).toBe('ana');
        expect(grant.video).toMatchObject({
          room: 'stream-1',
          canPublish: true,
        });
        expect(guests[0]).toMatchObject({
          status: 'ON_AIR',
          joinedAt: expect.any(Date),
        });
        expect(mockRecording.startCoHost).toHaveBeenCalledWith(
          'stream-1',
          'ana',
        );
        expect(mockServer.emit).toHaveBeenCalledWith('live:cohost_joined', {
          coHostId: 'ana',
          coHostUsername: 'ana_name',
        });
        expect(mockServer.emit).toHaveBeenCalledWith('live:guests_changed', {
          streamId: 'stream-1',
          guests: [
            {
              profileId: 'ana',
              username: 'ana_name',
              avatar: null,
              status: 'ON_AIR',
            },
          ],
        });
      });

      it('gives a guest already on air a token again, and changes nothing', async () => {
        seedGuest('stream-1', 'ana', 'ON_AIR', { joinedAt: new Date(5) });

        const result = await service.acceptGuestInvite('stream-1', 'ana');

        expect(typeof result.token).toBe('string');
        expect(guests[0].joinedAt).toEqual(new Date(5));
        expect(mockPrismaService.liveGuest.update).not.toHaveBeenCalled();
        expect(mockServer.emit).not.toHaveBeenCalled();
      });

      it('refuses a Profile not invited, or invited no more', async () => {
        for (const status of [null, 'DECLINED', 'LEFT', 'REMOVED'] as const) {
          guests = [];
          if (status) seedGuest('stream-1', 'ana', status);
          await expect(
            service.acceptGuestInvite('stream-1', 'ana'),
          ).rejects.toMatchObject({ errorCode: 'NOT_A_LIVE_GUEST' });
        }
        expect(mockRecording.startCoHost).not.toHaveBeenCalled();
      });

      it('refuses when three guests are already on air', async () => {
        for (const other of ['bea', 'cai', 'dan']) {
          seedGuest('stream-1', other, 'ON_AIR');
        }
        seedGuest('stream-1', 'ana', 'INVITED');

        await expect(
          service.acceptGuestInvite('stream-1', 'ana'),
        ).rejects.toMatchObject({ errorCode: 'LIVE_GUESTS_FULL' });
        expect(statusOf('stream-1', 'ana')).toBe('INVITED');
      });

      it('refuses a live that ended, one that does not exist, and a block with the host', async () => {
        seedGuest('stream-1', 'ana', 'INVITED');
        mockPrismaService.liveStream.findUnique
          .mockResolvedValueOnce(onAirLive({ status: 'ENDED' }))
          .mockResolvedValueOnce(onAirLive({ status: 'ENDED' }));
        await expect(
          service.acceptGuestInvite('stream-1', 'ana'),
        ).rejects.toMatchObject({ errorCode: 'STREAM_NOT_ACTIVE' });

        mockPrismaService.liveStream.findUnique.mockResolvedValueOnce(null);
        await expect(
          service.acceptGuestInvite('stream-1', 'ana'),
        ).rejects.toMatchObject({ errorCode: 'STREAM_NOT_FOUND' });

        mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b-1' });
        await expect(
          service.acceptGuestInvite('stream-1', 'ana'),
        ).rejects.toMatchObject({ errorCode: 'NOT_A_LIVE_GUEST' });
        expect(statusOf('stream-1', 'ana')).toBe('INVITED');
      });

      it('reads the live again once locked: one gone meanwhile is answered as it was', async () => {
        seedGuest('stream-1', 'ana', 'INVITED');
        mockPrismaService.liveStream.findUnique
          .mockResolvedValueOnce(onAirLive())
          .mockResolvedValueOnce(null);

        await service.acceptGuestInvite('stream-1', 'ana');

        expect(statusOf('stream-1', 'ana')).toBe('ON_AIR');
      });
    });

    describe('declining', () => {
      it('the invited Profile declines, and the room is told', async () => {
        seedGuest('stream-1', 'ana', 'INVITED');

        await expect(
          service.declineGuestInvite('stream-1', 'ana'),
        ).resolves.toEqual({ success: true });

        expect(guests[0]).toMatchObject({
          status: 'DECLINED',
          endedAt: expect.any(Date),
        });
        expect(mockServer.emit).toHaveBeenCalledWith('live:guests_changed', {
          streamId: 'stream-1',
          guests: [],
        });
      });

      it('refuses a Profile not invited, or already on air', async () => {
        for (const status of [null, 'ON_AIR'] as const) {
          guests = [];
          if (status) seedGuest('stream-1', 'ana', status);
          await expect(
            service.declineGuestInvite('stream-1', 'ana'),
          ).rejects.toMatchObject({ errorCode: 'NOT_A_LIVE_GUEST' });
        }
      });

      it('refuses an invite answered or removed meanwhile', async () => {
        seedGuest('stream-1', 'ana', 'INVITED');
        mockPrismaService.liveGuest.updateMany.mockResolvedValueOnce({
          count: 0,
        });

        await expect(
          service.declineGuestInvite('stream-1', 'ana'),
        ).rejects.toMatchObject({ errorCode: 'NOT_A_LIVE_GUEST' });
        expect(mockServer.emit).not.toHaveBeenCalled();
      });
    });

    describe('leaving', () => {
      it('a guest on air leaves: only their recording stops and they leave the room', async () => {
        seedGuest('stream-1', 'ana', 'ON_AIR');
        seedGuest('stream-1', 'bea', 'ON_AIR');
        profilesFound(null);

        await expect(service.leaveAsGuest('stream-1', 'ana')).resolves.toEqual({
          success: true,
        });

        expect(statusOf('stream-1', 'ana')).toBe('LEFT');
        expect(statusOf('stream-1', 'bea')).toBe('ON_AIR');
        expect(mockRecording.stopCoHost.mock.calls).toEqual([
          ['stream-1', 'ana'],
        ]);
        expect(mockRecording.removeFromRoom.mock.calls).toEqual([
          ['stream-1', 'ana'],
        ]);
        expect(mockServer.emit).toHaveBeenCalledWith('live:cohost_left', {
          coHostId: 'ana',
        });
        expect(emitted('live:guest_removed')).toEqual([]);
        expect(mockServer.emit).toHaveBeenCalledWith('live:guests_changed', {
          streamId: 'stream-1',
          guests: [
            {
              profileId: 'bea',
              username: 'bea_name',
              avatar: null,
              status: 'ON_AIR',
            },
          ],
        });
      });

      it('refuses a guest not on air', async () => {
        for (const status of [null, 'INVITED', 'LEFT'] as const) {
          guests = [];
          if (status) seedGuest('stream-1', 'ana', status);
          await expect(
            service.leaveAsGuest('stream-1', 'ana'),
          ).rejects.toMatchObject({ errorCode: 'NOT_A_LIVE_GUEST' });
        }
        expect(mockRecording.stopCoHost).not.toHaveBeenCalled();
      });

      it('refuses a guest taken off meanwhile', async () => {
        seedGuest('stream-1', 'ana', 'ON_AIR');
        mockPrismaService.liveGuest.findUnique
          .mockImplementationOnce(liveGuestFindUnique)
          .mockResolvedValueOnce({ status: 'REMOVED' });

        await expect(
          service.leaveAsGuest('stream-1', 'ana'),
        ).rejects.toMatchObject({ errorCode: 'NOT_A_LIVE_GUEST' });
        expect(mockRecording.stopCoHost).not.toHaveBeenCalled();
      });
    });

    describe('removing', () => {
      it('the host removes one guest on air by Profile; the others go on', async () => {
        seedGuest('stream-1', 'ana', 'ON_AIR');
        seedGuest('stream-1', 'bea', 'ON_AIR');
        seedGuest('stream-1', 'cai', 'INVITED');

        await expect(
          service.removeGuest('stream-1', HOST, 'bea'),
        ).resolves.toEqual({ success: true });

        expect(statusOf('stream-1', 'bea')).toBe('REMOVED');
        expect(statusOf('stream-1', 'ana')).toBe('ON_AIR');
        expect(statusOf('stream-1', 'cai')).toBe('INVITED');
        expect(mockServer.to).toHaveBeenCalledWith('user:bea');
        expect(mockServer.emit).toHaveBeenCalledWith('live:guest_removed', {
          streamId: 'stream-1',
        });
        expect(mockServer.emit).toHaveBeenCalledWith('live:cohost_removed', {
          streamId: 'stream-1',
        });
        expect(mockRecording.stopCoHost.mock.calls).toEqual([
          ['stream-1', 'bea'],
        ]);
        // The live service takes them out of the room as well, after the
        // app was told, so it does not take that for a lost connection.
        expect(mockRecording.removeFromRoom.mock.calls).toEqual([
          ['stream-1', 'bea'],
        ]);
        const told = mockServer.emit.mock.calls.findIndex(
          ([name]: unknown[]) => name === 'live:guest_removed',
        );
        expect(mockServer.emit.mock.invocationCallOrder[told]).toBeLessThan(
          mockRecording.removeFromRoom.mock.invocationCallOrder[0],
        );
        expect(mockServer.emit).toHaveBeenCalledWith('live:cohost_left', {
          coHostId: 'bea',
        });
      });

      it('the host removes a guest only invited, with nothing to stop', async () => {
        seedGuest('stream-1', 'ana', 'INVITED');

        await service.removeGuest('stream-1', HOST, 'ana');

        expect(statusOf('stream-1', 'ana')).toBe('REMOVED');
        expect(mockRecording.stopCoHost).not.toHaveBeenCalled();
        expect(mockRecording.removeFromRoom).not.toHaveBeenCalled();
        expect(emitted('live:cohost_left')).toEqual([]);
      });

      it('refuses anyone but the host, a Profile with no place, and a live that does not exist', async () => {
        seedGuest('stream-1', 'ana', 'ON_AIR');
        seedGuest('stream-1', 'bea', 'LEFT');

        await expect(
          service.removeGuest('stream-1', 'ana', 'ana'),
        ).rejects.toMatchObject({ errorCode: 'ONLY_HOST_CAN_REMOVE' });
        for (const guest of ['bea', 'nobody']) {
          await expect(
            service.removeGuest('stream-1', HOST, guest),
          ).rejects.toMatchObject({ errorCode: 'NOT_A_LIVE_GUEST' });
        }
        mockPrismaService.liveStream.findUnique.mockResolvedValueOnce(null);
        await expect(
          service.removeGuest('stream-1', HOST, 'ana'),
        ).rejects.toMatchObject({ errorCode: 'STREAM_NOT_FOUND' });
        expect(statusOf('stream-1', 'ana')).toBe('ON_AIR');
      });

      it('refuses a guest who left meanwhile', async () => {
        seedGuest('stream-1', 'ana', 'ON_AIR');
        mockPrismaService.liveGuest.updateMany.mockResolvedValueOnce({
          count: 0,
        });

        await expect(
          service.removeGuest('stream-1', HOST, 'ana'),
        ).rejects.toMatchObject({ errorCode: 'NOT_A_LIVE_GUEST' });
        expect(mockRecording.removeFromRoom).not.toHaveBeenCalled();
      });

      it('removing the co-host, as installed apps still do, removes every guest with a place', async () => {
        seedGuest('stream-1', 'ana', 'ON_AIR');
        seedGuest('stream-1', 'bea', 'INVITED');
        seedGuest('stream-1', 'cai', 'LEFT');

        await expect(
          service.removeAllGuests('stream-1', HOST),
        ).resolves.toEqual({ success: true });

        expect(statusOf('stream-1', 'ana')).toBe('REMOVED');
        expect(statusOf('stream-1', 'bea')).toBe('REMOVED');
        expect(statusOf('stream-1', 'cai')).toBe('LEFT');
        expect(mockRecording.removeFromRoom.mock.calls).toEqual([
          ['stream-1', 'ana'],
        ]);
      });

      it('removing the co-host is only for the host of a live that exists', async () => {
        seedGuest('stream-1', 'ana', 'ON_AIR');

        await expect(
          service.removeAllGuests('stream-1', 'ana'),
        ).rejects.toMatchObject({ errorCode: 'ONLY_HOST_CAN_REMOVE' });
        mockPrismaService.liveStream.findUnique.mockResolvedValueOnce(null);
        await expect(
          service.removeAllGuests('stream-1', HOST),
        ).rejects.toMatchObject({ errorCode: 'STREAM_NOT_FOUND' });
        expect(statusOf('stream-1', 'ana')).toBe('ON_AIR');
      });
    });

    describe('when the live ends', () => {
      it('every guest with a place is out of it', async () => {
        seedGuest('stream-1', 'ana', 'ON_AIR');
        seedGuest('stream-1', 'bea', 'INVITED');
        seedGuest('stream-1', 'cai', 'DECLINED');
        mockPrismaService.liveStream.findMany.mockResolvedValueOnce([
          { id: 'stream-1' },
        ]);

        await service.endStream(HOST);

        expect(statusOf('stream-1', 'ana')).toBe('LEFT');
        expect(statusOf('stream-1', 'bea')).toBe('LEFT');
        expect(statusOf('stream-1', 'cai')).toBe('DECLINED');
      });

      it('a new live of the host ends the guests of the one it replaces', async () => {
        seedGuest('stream-old', 'ana', 'ON_AIR');
        seedGuest('stream-other', 'bea', 'ON_AIR');
        mockPrismaService.liveStream.findMany.mockResolvedValueOnce([
          { id: 'stream-old' },
        ]);
        mockPrismaService.liveStream.create.mockResolvedValue({
          id: 'stream-new',
          hostId: HOST,
        });

        await service.startStream(HOST, 'x');

        expect(statusOf('stream-old', 'ana')).toBe('LEFT');
        expect(statusOf('stream-other', 'bea')).toBe('ON_AIR');
      });
    });

    describe('what a live answers', () => {
      const shownHost = {
        id: HOST,
        username: 'host',
        avatar: null,
        isAccountBanned: false,
        suspendedUntil: null,
        user: { isActive: true, deactivatedAt: null },
      };
      const row = (profileId: string, status: string) => ({
        profileId,
        status,
        profile: { username: `${profileId}_name`, avatar: null },
      });

      it('to a viewer, only the guests on air, and the first on air as the co-host installed apps show', async () => {
        mockPrismaService.liveStream.findUnique.mockResolvedValue({
          id: 'stream-1',
          hostId: HOST,
          coHostId: 'stale-column',
          status: 'LIVE',
          audience: 'EVERYONE',
          host: shownHost,
          guests: [row('ana', 'ON_AIR'), row('bea', 'INVITED')],
        });

        const stream = await service.getStream('stream-1', 'viewer');

        const [args] = mockPrismaService.liveStream.findUnique.mock.calls[0];
        expect(args.include.guests).toEqual({
          where: { status: { in: ['INVITED', 'ON_AIR'] } },
          select: {
            profileId: true,
            status: true,
            profile: { select: { username: true, avatar: true } },
          },
          orderBy: [
            { joinedAt: { sort: 'asc', nulls: 'last' } },
            { invitedAt: 'asc' },
          ],
        });
        expect(stream.guests).toEqual([
          {
            profileId: 'ana',
            username: 'ana_name',
            avatar: null,
            status: 'ON_AIR',
          },
        ]);
        expect(stream.coHostId).toBe('ana');
        expect(stream.coHost).toEqual({
          id: 'ana',
          profile: { username: 'ana_name', avatar: null },
        });
      });

      it('to its host, the guests invited too', async () => {
        mockPrismaService.liveStream.findUnique.mockResolvedValue({
          id: 'stream-1',
          hostId: HOST,
          status: 'LIVE',
          audience: 'EVERYONE',
          host: shownHost,
          guests: [row('ana', 'ON_AIR'), row('bea', 'INVITED')],
        });

        const stream = await service.getStream('stream-1', HOST);

        expect(stream.guests).toEqual([
          {
            profileId: 'ana',
            username: 'ana_name',
            avatar: null,
            status: 'ON_AIR',
          },
          {
            profileId: 'bea',
            username: 'bea_name',
            avatar: null,
            status: 'INVITED',
          },
        ]);
      });

      it('in the list of lives, the invited only to the host, and never without a viewer', async () => {
        const lives = () => [
          {
            id: 'stream-1',
            hostId: HOST,
            host: { id: HOST, username: 'host', avatar: null },
            guests: [row('ana', 'ON_AIR'), row('bea', 'INVITED')],
          },
        ];
        const listed = async (viewer?: string) => {
          mockPrismaService.liveStream.findMany.mockResolvedValueOnce(lives());
          const [stream] = await service.getActiveStreams(viewer);
          return stream.guests.map((guest) => guest.profileId);
        };

        expect(await listed(HOST)).toEqual(['ana', 'bea']);
        expect(await listed('bea')).toEqual(['ana']);
        expect(await listed(undefined)).toEqual(['ana']);
      });

      it('no co-host while nobody is on air, whatever the old column says', async () => {
        mockPrismaService.liveStream.findMany.mockResolvedValueOnce([
          {
            id: 'stream-1',
            hostId: HOST,
            coHostId: 'stale-column',
            host: { id: HOST, username: 'host', avatar: null },
            guests: [row('bea', 'INVITED')],
          },
        ]);

        const [stream] = await service.getActiveStreams(HOST);

        expect(stream).toMatchObject({
          coHostId: null,
          coHost: null,
          guests: [{ profileId: 'bea', status: 'INVITED' }],
        });
      });

      it('lets a guest invited to a practice have a token to watch it', async () => {
        seedGuest('stream-1', 'ana', 'INVITED');
        mockPrismaService.liveStream.findUnique.mockResolvedValue({
          id: 'stream-1',
          hostId: HOST,
          status: 'LIVE',
          audience: 'PRACTICE',
          host: shownHost,
        });

        await expect(
          service.getViewerToken('stream-1', 'user-ana', 'ana'),
        ).resolves.toHaveProperty('token');
        await expect(
          service.getViewerToken('stream-1', 'user-bea', 'bea'),
        ).rejects.toMatchObject({ errorCode: 'STREAM_NOT_FOUND' });
      });
    });
  });
});
