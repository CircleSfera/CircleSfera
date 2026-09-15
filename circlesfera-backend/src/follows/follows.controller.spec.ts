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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { FollowsController } from './follows.controller.js';
import { FollowsService } from './follows.service.js';

describe('FollowsController', () => {
  let app: INestApplication;

  const mockService = {
    toggle: vi.fn(),
    checkFollow: vi.fn(),
    getFollowers: vi.fn(),
    getFollowing: vi.fn(),
    blockUser: vi.fn(),
    unblockUser: vi.fn(),
    muteUser: vi.fn(),
    unmuteUser: vi.fn(),
    getMutedUsers: vi.fn(),
    getBlockedUsers: vi.fn(),
    getPendingRequests: vi.fn(),
    acceptFollowRequest: vi.fn(),
    rejectFollowRequest: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [FollowsController],
      providers: [{ provide: FollowsService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects follow toggle without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users/alice/follow/toggle')
      .expect(401);

    expect(mockService.toggle).not.toHaveBeenCalled();
  });

  it('toggles follow with username, profileId and userId', async () => {
    mockService.toggle.mockResolvedValue({ following: true });

    await request(app.getHttpServer())
      .post('/api/v1/users/alice/follow/toggle')
      .set(BEARER)
      .expect(201);

    expect(mockService.toggle).toHaveBeenCalledWith(
      'alice',
      TEST_USER.profileId,
      TEST_USER.userId,
    );
  });

  it('checks follow status with the session profileId', async () => {
    mockService.checkFollow.mockResolvedValue({ following: false });

    await request(app.getHttpServer())
      .get('/api/v1/users/alice/follow/check')
      .set(BEARER)
      .expect(200);

    expect(mockService.checkFollow).toHaveBeenCalledWith(
      'alice',
      TEST_USER.profileId,
    );
  });

  it('lists followers and following by username', async () => {
    mockService.getFollowers.mockResolvedValue([]);
    mockService.getFollowing.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/users/alice/follow/followers')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users/alice/follow/following')
      .set(BEARER)
      .expect(200);

    expect(mockService.getFollowers).toHaveBeenCalledWith('alice');
    expect(mockService.getFollowing).toHaveBeenCalledWith('alice');
  });

  it('blocks and unblocks using the session profileId', async () => {
    mockService.blockUser.mockResolvedValue({ blocked: true });
    mockService.unblockUser.mockResolvedValue({ blocked: false });

    await request(app.getHttpServer())
      .post('/api/v1/users/alice/follow/block')
      .set(BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/users/alice/follow/unblock')
      .set(BEARER)
      .expect(201);

    expect(mockService.blockUser).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'alice',
    );
    expect(mockService.unblockUser).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'alice',
    );
  });

  it('rejects mute with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users/alice/follow/mute')
      .set(BEARER)
      .send({ duration: '24h', actorId: 'attacker' })
      .expect(400);

    expect(mockService.muteUser).not.toHaveBeenCalled();
  });

  it('mutes and unmutes using the session profileId', async () => {
    mockService.muteUser.mockResolvedValue({ muted: true });
    mockService.unmuteUser.mockResolvedValue({ muted: false });

    await request(app.getHttpServer())
      .post('/api/v1/users/alice/follow/mute')
      .set(BEARER)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/users/alice/follow/unmute')
      .set(BEARER)
      .expect(201);

    expect(mockService.muteUser).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'alice',
      undefined,
    );
    expect(mockService.unmuteUser).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'alice',
    );
  });

  it('lists muted, blocked and pending from the session profile', async () => {
    mockService.getMutedUsers.mockResolvedValue([]);
    mockService.getBlockedUsers.mockResolvedValue([]);
    mockService.getPendingRequests.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/users/me/follow/muted')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users/me/follow/blocked')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users/me/follow/pending')
      .set(BEARER)
      .expect(200);

    expect(mockService.getMutedUsers).toHaveBeenCalledWith(TEST_USER.profileId);
    expect(mockService.getBlockedUsers).toHaveBeenCalledWith(
      TEST_USER.profileId,
    );
    expect(mockService.getPendingRequests).toHaveBeenCalledWith(
      TEST_USER.profileId,
    );
  });

  it('accepts and rejects follow requests as the session profile', async () => {
    mockService.acceptFollowRequest.mockResolvedValue({ accepted: true });
    mockService.rejectFollowRequest.mockResolvedValue({ rejected: true });

    await request(app.getHttpServer())
      .post('/api/v1/users/bob/follow/accept')
      .set(BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/users/bob/follow/reject')
      .set(BEARER)
      .expect(201);

    expect(mockService.acceptFollowRequest).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'bob',
    );
    expect(mockService.rejectFollowRequest).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'bob',
    );
  });
});
