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
import { CloseFriendsController } from './close-friends.controller.js';
import { CloseFriendsService } from './close-friends.service.js';

describe('CloseFriendsController', () => {
  let app: INestApplication;

  const mockService = {
    getCloseFriends: vi.fn(),
    toggleCloseFriend: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [CloseFriendsController],
      providers: [{ provide: CloseFriendsService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects listing without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/close-friends').expect(401);

    expect(mockService.getCloseFriends).not.toHaveBeenCalled();
  });

  it('lists close friends as the session profile', async () => {
    mockService.getCloseFriends.mockResolvedValue([{ id: 'friend-1' }]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/close-friends')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual([{ id: 'friend-1' }]);
    expect(mockService.getCloseFriends).toHaveBeenCalledWith(
      TEST_USER.profileId,
    );
  });

  it('toggles a close friend as the session profile', async () => {
    mockService.toggleCloseFriend.mockResolvedValue({ isCloseFriend: true });

    const res = await request(app.getHttpServer())
      .post('/api/v1/close-friends/friend-2')
      .set(BEARER)
      .expect(201);

    expect(res.body).toEqual({ isCloseFriend: true });
    expect(mockService.toggleCloseFriend).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'friend-2',
    );
  });
});
