import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AccessToken, WebhookEvent } from 'livekit-server-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { LiveRoomWebhookService } from './live-room-webhook.service.js';
import type { LiveRecordingService } from './recording/live-recording.service.js';

const KEY = 'test-key';
const SECRET = 'test-secret-of-at-least-thirty-two-chars';
const STREAM = 'stream-1';
const HOST = 'host-1';
const GUEST = 'guest-1';
const VIEWER = 'viewer-1';

function config(values: Record<string, string | undefined>) {
  return { get: (name: string) => values[name] } as unknown as ConfigService;
}

/** An event as the live service sends it, and its signature. */
async function signed(event: Record<string, unknown>, secret = SECRET) {
  const body = WebhookEvent.fromJson(event as never).toJsonString();
  const token = new AccessToken(KEY, secret);
  token.sha256 = createHash('sha256').update(body).digest('base64');
  return { body: Buffer.from(body), authorization: await token.toJwt() };
}

function joined(identity: string, canPublish = false) {
  return {
    event: 'participant_joined',
    room: { name: STREAM },
    participant: { identity, permission: { canPublish, canSubscribe: true } },
  };
}

describe('LiveRoomWebhookService', () => {
  let prisma: {
    liveStream: { findUnique: ReturnType<typeof vi.fn> };
    block: { findFirst: ReturnType<typeof vi.fn> };
    liveGuest: { findMany: ReturnType<typeof vi.fn> };
    closeFriend: { findUnique: ReturnType<typeof vi.fn> };
    user: { findMany: ReturnType<typeof vi.fn> };
  };
  let recording: {
    removeFromRoom: ReturnType<typeof vi.fn>;
    stopPublishing: ReturnType<typeof vi.fn>;
  };
  let service: LiveRoomWebhookService;

  beforeEach(() => {
    prisma = {
      liveStream: {
        findUnique: vi.fn().mockResolvedValue({
          id: STREAM,
          status: 'LIVE',
          hostId: HOST,
          audience: 'EVERYONE',
          guests: [{ profileId: GUEST }],
        }),
      },
      block: { findFirst: vi.fn().mockResolvedValue(null) },
      liveGuest: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ profileId: GUEST, status: 'ON_AIR' }]),
      },
      closeFriend: { findUnique: vi.fn().mockResolvedValue(null) },
      // Every Profile is a real account: no audience split.
      user: { findMany: vi.fn().mockResolvedValue([]) },
    };
    recording = {
      removeFromRoom: vi.fn().mockResolvedValue(undefined),
      stopPublishing: vi.fn().mockResolvedValue(undefined),
    };
    service = new LiveRoomWebhookService(
      config({ LIVEKIT_API_KEY: KEY, LIVEKIT_API_SECRET: SECRET }),
      prisma as unknown as PrismaService,
      recording as unknown as LiveRecordingService,
    );
  });

  it('acts on an event signed with the live service key', async () => {
    const { body, authorization } = await signed(joined(VIEWER, true));

    await service.receive(body, authorization);

    expect(recording.stopPublishing).toHaveBeenCalledWith(STREAM, VIEWER);
  });

  it.each([
    [
      'no signature',
      async () => ({
        ...(await signed(joined(VIEWER, true))),
        authorization: undefined,
      }),
    ],
    [
      'a signature with another secret',
      () =>
        signed(joined(VIEWER, true), 'another-secret-of-thirty-two-characters'),
    ],
    [
      'a body changed after it was signed',
      async () => {
        const event = await signed(joined(VIEWER, true));
        return {
          ...event,
          body: Buffer.from(event.body.toString().replace(VIEWER, HOST)),
        };
      },
    ],
  ])('refuses an event with %s, and does nothing', async (_, make) => {
    const { body, authorization } = await make();

    await expect(service.receive(body, authorization)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.liveStream.findUnique).not.toHaveBeenCalled();
    expect(recording.stopPublishing).not.toHaveBeenCalled();
    expect(recording.removeFromRoom).not.toHaveBeenCalled();
  });

  it('refuses every event when the live service key is not set', async () => {
    const unset = new LiveRoomWebhookService(
      config({}),
      prisma as unknown as PrismaService,
      recording as unknown as LiveRecordingService,
    );
    const { body, authorization } = await signed(joined(VIEWER, true));

    await expect(unset.receive(body, authorization)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('takes the right to publish from one who is neither host nor on air, who keeps watching', async () => {
    await service.enforce(WebhookEvent.fromJson(joined(VIEWER, true) as never));

    expect(recording.stopPublishing).toHaveBeenCalledWith(STREAM, VIEWER);
    expect(recording.removeFromRoom).not.toHaveBeenCalled();
  });

  it('does the same when such a one starts publishing', async () => {
    await service.enforce(
      WebhookEvent.fromJson({
        ...joined(VIEWER, true),
        event: 'track_published',
      } as never),
    );

    expect(recording.stopPublishing).toHaveBeenCalledWith(STREAM, VIEWER);
  });

  it('leaves the host and a guest on air as they are', async () => {
    await service.enforce(WebhookEvent.fromJson(joined(HOST, true) as never));
    await service.enforce(WebhookEvent.fromJson(joined(GUEST, true) as never));

    expect(recording.stopPublishing).not.toHaveBeenCalled();
    expect(recording.removeFromRoom).not.toHaveBeenCalled();
  });

  it('leaves a viewer who may watch and may not publish as they are', async () => {
    await service.enforce(WebhookEvent.fromJson(joined(VIEWER) as never));

    expect(recording.stopPublishing).not.toHaveBeenCalled();
    expect(recording.removeFromRoom).not.toHaveBeenCalled();
  });

  it('takes out of the room one in a block with the host', async () => {
    prisma.block.findFirst.mockResolvedValueOnce({ id: 'b' });

    await service.enforce(WebhookEvent.fromJson(joined(VIEWER, true) as never));

    expect(recording.removeFromRoom).toHaveBeenCalledWith(STREAM, VIEWER);
    expect(recording.stopPublishing).not.toHaveBeenCalled();
  });

  it('takes out of the room one in a block with a guest on air', async () => {
    // Not with the host; with a guest on air.
    prisma.block.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'b' });

    await service.enforce(WebhookEvent.fromJson(joined(VIEWER) as never));

    expect(recording.removeFromRoom).toHaveBeenCalledWith(STREAM, VIEWER);
  });

  it('takes out of the room one who is not a close friend of a close friends live', async () => {
    prisma.liveStream.findUnique.mockResolvedValueOnce({
      id: STREAM,
      status: 'LIVE',
      hostId: HOST,
      audience: 'CLOSE_FRIENDS',
      guests: [],
    });

    await service.enforce(WebhookEvent.fromJson(joined(VIEWER) as never));

    expect(recording.removeFromRoom).toHaveBeenCalledWith(STREAM, VIEWER);
  });

  it.each([
    [
      'a live that ended',
      {
        id: STREAM,
        status: 'ENDED',
        hostId: HOST,
        audience: 'EVERYONE',
        guests: [],
      },
    ],
    ['a live that does not exist', null],
  ])('does nothing for %s', async (_, stream) => {
    prisma.liveStream.findUnique.mockResolvedValueOnce(stream);

    await service.enforce(WebhookEvent.fromJson(joined(VIEWER, true) as never));

    expect(recording.stopPublishing).not.toHaveBeenCalled();
    expect(recording.removeFromRoom).not.toHaveBeenCalled();
  });

  it.each([
    [
      'another kind of event',
      { event: 'room_started', room: { name: STREAM } },
    ],
    [
      'an arrival with no room',
      { event: 'participant_joined', participant: { identity: VIEWER } },
    ],
    [
      'an arrival with no participant',
      { event: 'participant_joined', room: { name: STREAM } },
    ],
  ])('ignores %s', async (_, event) => {
    await service.enforce(WebhookEvent.fromJson(event as never));

    expect(prisma.liveStream.findUnique).not.toHaveBeenCalled();
  });
});
