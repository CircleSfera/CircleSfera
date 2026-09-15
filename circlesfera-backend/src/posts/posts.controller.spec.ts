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
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { OwnershipGuard } from '../auth/guards/ownership.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

describe('PostsController', () => {
  let app: INestApplication;

  const mockService = {
    create: vi.fn(),
    findAll: vi.fn(),
    getFramesFeed: vi.fn(),
    findByUser: vi.fn(),
    getTaggedPosts: vi.fn(),
    getByTag: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    adminRemove: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [PostsController],
      providers: [{ provide: PostsService, useValue: mockService }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: EmailVerifiedGuard, mode: 'allow' },
        { guard: JwtOptionalGuard, mode: 'optional' },
        { guard: OwnershipGuard, mode: 'allow' },
        { guard: AdminJwtAuthGuard, mode: 'admin' },
        { guard: AdminGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects create without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/posts')
      .send({ caption: 'Hello' })
      .expect(401);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/posts')
      .set(BEARER)
      .send({ caption: 'Hello', authorId: 'attacker' })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('creates a post as the session profile', async () => {
    mockService.create.mockResolvedValue({ id: 'post-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/posts')
      .set(BEARER)
      .send({ caption: 'Hello' })
      .expect(201);

    expect(res.body).toEqual({ id: 'post-1' });
    expect(mockService.create).toHaveBeenCalledWith(TEST_USER.profileId, {
      caption: 'Hello',
    });
  });

  it('lists posts with the viewer profile when authenticated', async () => {
    mockService.findAll.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/posts')
      .query({ page: 1, limit: 10, sort: 'trending' })
      .set(BEARER)
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
      'trending',
      TEST_USER.profileId,
    );
  });

  it('lists posts without a profile when anonymous', async () => {
    mockService.findAll.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/posts')
      .query({ page: 1, limit: 10, sort: 'latest' })
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
      'latest',
      undefined,
    );
  });

  it('loads Frames with the viewer profile when present', async () => {
    mockService.getFramesFeed.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/posts/frames')
      .query({ page: 1, limit: 10 })
      .set(BEARER)
      .expect(200);

    expect(mockService.getFramesFeed).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
      TEST_USER.profileId,
    );
  });

  it('loads Frames without a profile when anonymous', async () => {
    mockService.getFramesFeed.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/posts/frames')
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(mockService.getFramesFeed).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
      undefined,
    );
  });

  it('lists another profile posts with type and viewer profileId', async () => {
    mockService.findByUser.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/posts/user/alice')
      .query({ page: 1, limit: 10, type: 'FRAME' })
      .set(BEARER)
      .expect(200);

    expect(mockService.findByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ page: 1, limit: 10 }),
      'FRAME',
      TEST_USER.profileId,
    );
  });

  it('lists another profile posts without a viewer when anonymous', async () => {
    mockService.findByUser.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/posts/user/alice')
      .query({ page: 1, limit: 10, type: 'POST' })
      .expect(200);

    expect(mockService.findByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ page: 1, limit: 10 }),
      'POST',
      undefined,
    );
  });

  it('loads tagged posts and hashtag posts without a session', async () => {
    mockService.getTaggedPosts.mockResolvedValue({ data: [] });
    mockService.getByTag.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/posts/user/alice/tagged')
      .query({ page: 1, limit: 10 })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/posts/tags/sfera')
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(mockService.getTaggedPosts).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ page: 1, limit: 10 }),
    );
    expect(mockService.getByTag).toHaveBeenCalledWith(
      'sfera',
      expect.objectContaining({ page: 1, limit: 10 }),
    );
  });

  it('loads one post with the viewer profile when present', async () => {
    mockService.findOne.mockResolvedValue({ id: 'post-1' });

    await request(app.getHttpServer())
      .get('/api/v1/posts/post-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.findOne).toHaveBeenCalledWith(
      'post-1',
      TEST_USER.profileId,
    );
  });

  it('loads one post without a profile when anonymous', async () => {
    mockService.findOne.mockResolvedValue({ id: 'post-1' });

    await request(app.getHttpServer()).get('/api/v1/posts/post-1').expect(200);

    expect(mockService.findOne).toHaveBeenCalledWith('post-1', undefined);
  });

  it('updates and deletes by post id with a session', async () => {
    mockService.update.mockResolvedValue({ id: 'post-1' });
    mockService.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .put('/api/v1/posts/post-1')
      .set(BEARER)
      .send({ caption: 'Edited' })
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/posts/post-1')
      .set(BEARER)
      .expect(204);

    expect(mockService.update).toHaveBeenCalledWith('post-1', {
      caption: 'Edited',
    });
    expect(mockService.remove).toHaveBeenCalledWith('post-1');
  });

  it('rejects admin delete with a user session', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/posts/post-1/admin')
      .set(BEARER)
      .expect(401);

    expect(mockService.adminRemove).not.toHaveBeenCalled();
  });

  it('admin-deletes by post id with an admin session', async () => {
    mockService.adminRemove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete('/api/v1/posts/post-1/admin')
      .set(ADMIN_BEARER)
      .expect(204);

    expect(mockService.adminRemove).toHaveBeenCalledWith('post-1');
  });
});
