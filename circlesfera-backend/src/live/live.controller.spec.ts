import { LIVE_TITLE_MAX_LENGTH } from '@circlesfera/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { LiveController } from './live.controller.js';
import { LiveService } from './live.service.js';
import { LiveGiftService } from './live-gift.service.js';
import { LiveStartNoticeService } from './live-start-notice.service.js';

describe('LiveController', () => {
  let app: INestApplication;

  const mockStartNotice = { tellFollowers: vi.fn().mockResolvedValue(0) };
  const mockLiveService = {
    startStream: vi.fn(),
    endStream: vi.fn(),
    getActiveStreams: vi.fn(),
    getStream: vi.fn(),
    getViewerToken: vi.fn(),
    inviteGuest: vi.fn(),
    acceptGuestInvite: vi.fn(),
    declineGuestInvite: vi.fn(),
    leaveAsGuest: vi.fn(),
    removeGuest: vi.fn(),
    removeAllGuests: vi.fn(),
  };

  const mockLiveGiftService = {
    sendGift: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [LiveController],
      providers: [
        { provide: LiveService, useValue: mockLiveService },
        { provide: LiveStartNoticeService, useValue: mockStartNotice },
        { provide: LiveGiftService, useValue: mockLiveGiftService },
      ],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: EmailVerifiedGuard, mode: 'allow' },
        { guard: IdentityVerifiedGuard, mode: 'session' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects live routes without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/live/active').expect(401);
    expect(mockLiveService.getActiveStreams).not.toHaveBeenCalled();
  });

  it('starts a stream as the session profileId', async () => {
    mockLiveService.startStream.mockResolvedValue({
      stream: { id: 'stream-1', audience: 'EVERYONE' },
      token: 'jwt',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/live/start')
      .set(BEARER)
      .send({ title: 'My Stream' })
      .expect(201);

    expect(res.body).toEqual({
      stream: { id: 'stream-1', audience: 'EVERYONE' },
      token: 'jwt',
    });
    expect(mockLiveService.startStream).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'My Stream',
      undefined,
    );
    // Once the live exists, the people who follow the host are told.
    expect(mockStartNotice.tellFollowers).toHaveBeenCalledWith(
      'stream-1',
      TEST_USER.profileId,
      'EVERYONE',
    );
  });

  it('starts a live for close friends, telling them only', async () => {
    mockStartNotice.tellFollowers.mockClear();
    mockLiveService.startStream.mockResolvedValue({
      stream: { id: 'stream-2', audience: 'CLOSE_FRIENDS' },
      token: 'jwt',
    });

    await request(app.getHttpServer())
      .post('/api/v1/live/start')
      .set(BEARER)
      .send({ title: 'Solo amigos', audience: 'CLOSE_FRIENDS' })
      .expect(201);

    expect(mockLiveService.startStream).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'Solo amigos',
      'CLOSE_FRIENDS',
    );
    expect(mockStartNotice.tellFollowers).toHaveBeenCalledWith(
      'stream-2',
      TEST_USER.profileId,
      'CLOSE_FRIENDS',
    );
  });

  it('tells nobody of a practice', async () => {
    mockStartNotice.tellFollowers.mockClear();
    mockLiveService.startStream.mockResolvedValue({
      stream: { id: 'stream-3', audience: 'PRACTICE' },
      token: 'jwt',
    });

    await request(app.getHttpServer())
      .post('/api/v1/live/start')
      .set(BEARER)
      .send({ audience: 'PRACTICE' })
      .expect(201);

    expect(mockStartNotice.tellFollowers).not.toHaveBeenCalled();
  });

  it('refuses an audience it does not know, and a title too long', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/live/start')
      .set(BEARER)
      .send({ audience: 'FOLLOWERS' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/live/start')
      .set(BEARER)
      .send({ title: 'x'.repeat(LIVE_TITLE_MAX_LENGTH + 1) })
      .expect(400);
  });

  it('tells nobody when the live could not start', async () => {
    mockStartNotice.tellFollowers.mockClear();
    mockLiveService.startStream.mockRejectedValue(new Error('no video'));

    await request(app.getHttpServer())
      .post('/api/v1/live/start')
      .set(BEARER)
      .send({ title: 'My Stream' })
      .expect(500);

    expect(mockStartNotice.tellFollowers).not.toHaveBeenCalled();
  });

  it('ends a stream as the session profileId', async () => {
    mockLiveService.endStream.mockResolvedValue({ success: true });

    const res = await request(app.getHttpServer())
      .post('/api/v1/live/end')
      .set(BEARER)
      .expect(201);

    expect(res.body).toEqual({ success: true });
    expect(mockLiveService.endStream).toHaveBeenCalledWith(TEST_USER.profileId);
  });

  it('lists active streams for the session', async () => {
    mockLiveService.getActiveStreams.mockResolvedValue([{ id: 'stream-1' }]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/live/active')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual([{ id: 'stream-1' }]);
    expect(mockLiveService.getActiveStreams).toHaveBeenCalled();
  });

  it('issues a viewer token as the session userId', async () => {
    mockLiveService.getViewerToken.mockResolvedValue({ token: 'jwt-viewer' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/live/join/stream-1')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ token: 'jwt-viewer' });
    // The Profile of the session, never the person's id.
    expect(mockLiveService.getViewerToken).toHaveBeenCalledWith(
      'stream-1',
      TEST_USER.profileId,
    );
  });

  it('rejects a gift with a client-supplied amount', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/live/stream-1/gift')
      .set(BEARER)
      .send({ giftId: 'rose', amountCents: 1 })
      .expect(400);

    expect(mockLiveGiftService.sendGift).not.toHaveBeenCalled();
  });

  it('sends a gift as the session userId without a client price', async () => {
    mockLiveGiftService.sendGift.mockResolvedValue({
      url: 'https://example.com',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/live/stream-1/gift')
      .set(BEARER)
      .set('idempotency-key', 'gift-1')
      .send({
        giftId: 'rose',
        returnUrl: 'https://example.com/live/stream-1',
      })
      .expect(201);

    expect(res.body).toEqual({ url: 'https://example.com' });
    expect(mockLiveGiftService.sendGift).toHaveBeenCalledWith(
      'stream-1',
      TEST_USER.userId,
      'rose',
      'https://example.com/live/stream-1',
      'gift-1',
      TEST_USER.profileId,
    );
  });

  describe('guests', () => {
    const profileId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const guests = [
      { profileId, username: 'ana', avatar: null, status: 'INVITED' },
    ];

    it('invites as a guest the Profile named, or the first of a person, and refuses neither or a non-id', async () => {
      mockLiveService.inviteGuest.mockResolvedValue({
        success: true,
        profileId,
        guests,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/live/stream-1/guests')
        .set(BEARER)
        .send({ profileId })
        .expect(201);
      expect(res.body).toEqual({ success: true, profileId, guests });
      await request(app.getHttpServer())
        .post('/api/v1/live/stream-1/guests')
        .set(BEARER)
        .send({ userId })
        .expect(201);
      for (const body of [
        {},
        { profileId: 'not-an-id' },
        { profileId: 'not-an-id', userId },
        { profileId, userId: 'not-an-id' },
      ]) {
        await request(app.getHttpServer())
          .post('/api/v1/live/stream-1/guests')
          .set(BEARER)
          .send(body)
          .expect(400);
      }

      expect(mockLiveService.inviteGuest.mock.calls).toEqual([
        ['stream-1', TEST_USER.profileId, { profileId }],
        ['stream-1', TEST_USER.profileId, { userId }],
      ]);
    });

    it('accepts, declines and leaves as the session Profile', async () => {
      mockLiveService.acceptGuestInvite.mockResolvedValue({
        token: 'jwt-guest',
        streamId: 'stream-1',
      });
      mockLiveService.declineGuestInvite.mockResolvedValue({ success: true });
      mockLiveService.leaveAsGuest.mockResolvedValue({ success: true });

      const accepted = await request(app.getHttpServer())
        .post('/api/v1/live/stream-1/guests/accept')
        .set(BEARER)
        .expect(201);
      expect(accepted.body).toEqual({
        token: 'jwt-guest',
        streamId: 'stream-1',
      });
      await request(app.getHttpServer())
        .post('/api/v1/live/stream-1/guests/decline')
        .set(BEARER)
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/live/stream-1/guests/leave')
        .set(BEARER)
        .expect(201);

      expect(mockLiveService.acceptGuestInvite).toHaveBeenCalledWith(
        'stream-1',
        TEST_USER.profileId,
      );
      expect(mockLiveService.declineGuestInvite).toHaveBeenCalledWith(
        'stream-1',
        TEST_USER.profileId,
      );
      expect(mockLiveService.leaveAsGuest).toHaveBeenCalledWith(
        'stream-1',
        TEST_USER.profileId,
      );
    });

    it('removes one guest by Profile id, as the host in session, and refuses a non-id', async () => {
      mockLiveService.removeGuest.mockResolvedValue({ success: true });

      await request(app.getHttpServer())
        .delete(`/api/v1/live/stream-1/guests/${profileId}`)
        .set(BEARER)
        .expect(200);
      await request(app.getHttpServer())
        .delete('/api/v1/live/stream-1/guests/not-an-id')
        .set(BEARER)
        .expect(400);

      expect(mockLiveService.removeGuest.mock.calls).toEqual([
        ['stream-1', TEST_USER.profileId, profileId],
      ]);
    });

    it('rejects the guest routes without a session', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/live/stream-1/guests')
        .send({ profileId })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/live/stream-1/guests/accept')
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/v1/live/stream-1/guests/${profileId}`)
        .expect(401);
      expect(mockLiveService.inviteGuest).not.toHaveBeenCalled();
      expect(mockLiveService.acceptGuestInvite).not.toHaveBeenCalled();
      expect(mockLiveService.removeGuest).not.toHaveBeenCalled();
    });
  });

  describe('the co-host routes installed apps still call', () => {
    it('invite a guest, answered as the invite of a co-host was, and refuse neither or a non-id', async () => {
      mockLiveService.inviteGuest.mockResolvedValue({
        success: true,
        profileId: 'ana',
        guests: [],
      });
      const profileId = '11111111-1111-4111-8111-111111111111';
      const userId = '22222222-2222-4222-8222-222222222222';

      const res = await request(app.getHttpServer())
        .post('/api/v1/live/stream-1/cohost/invite')
        .set(BEARER)
        .send({ coHostProfileId: profileId })
        .expect(201);
      expect(res.body).toEqual({ success: true, coHostId: 'ana' });
      await request(app.getHttpServer())
        .post('/api/v1/live/stream-1/cohost/invite')
        .set(BEARER)
        .send({ coHostUserId: userId })
        .expect(201);
      for (const body of [
        {},
        { coHostProfileId: 'not-an-id' },
        // Both given: each must be an id.
        { coHostProfileId: 'not-an-id', coHostUserId: userId },
        { coHostProfileId: profileId, coHostUserId: 'not-an-id' },
      ]) {
        await request(app.getHttpServer())
          .post('/api/v1/live/stream-1/cohost/invite')
          .set(BEARER)
          .send(body)
          .expect(400);
      }

      expect(mockLiveService.inviteGuest.mock.calls).toEqual([
        ['stream-1', TEST_USER.profileId, { profileId }],
        ['stream-1', TEST_USER.profileId, { userId }],
      ]);
    });

    it('accept as a guest, and removing the co-host removes every guest', async () => {
      mockLiveService.acceptGuestInvite.mockResolvedValue({
        token: 'jwt-guest',
        streamId: 'stream-1',
      });
      mockLiveService.removeAllGuests.mockResolvedValue({ success: true });

      const accepted = await request(app.getHttpServer())
        .post('/api/v1/live/stream-1/cohost/accept')
        .set(BEARER)
        .expect(201);
      expect(accepted.body).toEqual({
        token: 'jwt-guest',
        streamId: 'stream-1',
      });
      await request(app.getHttpServer())
        .delete('/api/v1/live/stream-1/cohost')
        .set(BEARER)
        .expect(200);

      expect(mockLiveService.acceptGuestInvite).toHaveBeenCalledWith(
        'stream-1',
        TEST_USER.profileId,
      );
      expect(mockLiveService.removeAllGuests).toHaveBeenCalledWith(
        'stream-1',
        TEST_USER.profileId,
      );
    });
  });
});
