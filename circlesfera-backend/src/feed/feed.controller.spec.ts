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
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';

describe('FeedController', () => {
  let app: INestApplication;

  const mockService = {
    getHybridFeed: vi.fn(),
    getFollowingFeed: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [FeedController],
      providers: [{ provide: FeedService, useValue: mockService }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: JwtOptionalGuard, mode: 'optional' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects Following without a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/feed/following')
      .query({ page: 1, limit: 10 })
      .expect(401);

    expect(mockService.getFollowingFeed).not.toHaveBeenCalled();
  });

  it('loads For You with the viewer profile and userId', async () => {
    mockService.getHybridFeed.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/feed/foryou')
      .query({ page: 1, limit: 10 })
      .set(BEARER)
      .expect(200);

    expect(mockService.getHybridFeed).toHaveBeenCalledWith(
      TEST_USER.profileId,
      expect.objectContaining({ page: 1, limit: 10 }),
      TEST_USER.userId,
    );
  });

  it('loads For You without a profile when anonymous', async () => {
    mockService.getHybridFeed.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/feed/foryou')
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(mockService.getHybridFeed).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ page: 1, limit: 10 }),
      null,
    );
  });

  it('loads Following as the session profile', async () => {
    mockService.getFollowingFeed.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/feed/following')
      .query({ page: 1, limit: 10 })
      .set(BEARER)
      .expect(200);

    expect(mockService.getFollowingFeed).toHaveBeenCalledWith(
      TEST_USER.profileId,
      expect.objectContaining({ page: 1, limit: 10 }),
    );
  });

  it('returns empty data when getFollowing is called without user', async () => {
    const controller = new FeedController(
      mockService as unknown as FeedService,
    );
    const res = await controller.getFollowing(null, {
      page: 1,
      limit: 10,
    } as any);
    expect(res).toEqual({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
    });
  });
});
