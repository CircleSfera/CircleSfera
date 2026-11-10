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
  TEST_UUID,
} from '../common/testing/http-controller.js';
import { PostTagsController } from './post-tags.controller.js';
import { PostTagsService } from './post-tags.service.js';

describe('PostTagsController', () => {
  let app: INestApplication;
  const mockService = {
    list: vi.fn(),
    approve: vi.fn(),
    remove: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [PostTagsController],
      providers: [{ provide: PostTagsService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers nothing without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/post-tags').expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/post-tags/${TEST_UUID}/approve`)
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/v1/post-tags/${TEST_UUID}`)
      .expect(401);
    expect(mockService.list).not.toHaveBeenCalled();
    expect(mockService.approve).not.toHaveBeenCalled();
    expect(mockService.remove).not.toHaveBeenCalled();
  });

  it("lists the session Profile's shown tags, or the ones waiting", async () => {
    mockService.list.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/post-tags')
      .set(BEARER)
      .expect(200);
    expect(mockService.list).toHaveBeenLastCalledWith(
      TEST_USER.profileId,
      'SHOWN',
    );

    await request(app.getHttpServer())
      .get('/api/v1/post-tags')
      .query({ status: 'PENDING' })
      .set(BEARER)
      .expect(200);
    expect(mockService.list).toHaveBeenLastCalledWith(
      TEST_USER.profileId,
      'PENDING',
    );
  });

  it('approves and removes a tag of the session Profile only', async () => {
    mockService.approve.mockResolvedValue({ postId: TEST_UUID });
    mockService.remove.mockResolvedValue({ postId: TEST_UUID });

    await request(app.getHttpServer())
      .post(`/api/v1/post-tags/${TEST_UUID}/approve`)
      .set(BEARER)
      .expect(201);
    expect(mockService.approve).toHaveBeenCalledWith(
      TEST_UUID,
      TEST_USER.profileId,
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/post-tags/${TEST_UUID}`)
      .set(BEARER)
      .expect(200);
    expect(mockService.remove).toHaveBeenCalledWith(
      TEST_UUID,
      TEST_USER.profileId,
    );
  });

  it('refuses a post id that is not one', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/post-tags/not-an-id/approve')
      .set(BEARER)
      .expect(400);
    expect(mockService.approve).not.toHaveBeenCalled();
  });
});
