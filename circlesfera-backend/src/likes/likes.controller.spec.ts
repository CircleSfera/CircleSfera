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
import { LikesController } from './likes.controller.js';
import { LikesService } from './likes.service.js';

describe('LikesController', () => {
  let app: INestApplication;

  const mockService = {
    toggle: vi.fn(),
    checkLike: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [LikesController],
      providers: [{ provide: LikesService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects toggle without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/posts/post-1/likes/toggle')
      .expect(401);

    expect(mockService.toggle).not.toHaveBeenCalled();
  });

  it('toggles like with postId, profileId and userId', async () => {
    mockService.toggle.mockResolvedValue({ liked: true });

    const res = await request(app.getHttpServer())
      .post('/api/v1/posts/post-1/likes/toggle')
      .set(BEARER)
      .expect(201);

    expect(res.body).toEqual({ liked: true });
    expect(mockService.toggle).toHaveBeenCalledWith(
      'post-1',
      TEST_USER.profileId,
      TEST_USER.userId,
    );
  });

  it('checks like with the session profileId', async () => {
    mockService.checkLike.mockResolvedValue({ liked: false });

    const res = await request(app.getHttpServer())
      .get('/api/v1/posts/post-1/likes/check')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ liked: false });
    expect(mockService.checkLike).toHaveBeenCalledWith(
      'post-1',
      TEST_USER.profileId,
    );
  });
});
