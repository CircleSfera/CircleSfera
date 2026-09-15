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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

describe('CommentsController', () => {
  let app: INestApplication;

  const mockService = {
    create: vi.fn(),
    findByPost: vi.fn(),
    remove: vi.fn(),
    likeComment: vi.fn(),
    unlikeComment: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [CommentsController],
      providers: [{ provide: CommentsService, useValue: mockService }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: EmailVerifiedGuard, mode: 'allow' },
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

  it('rejects create without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/posts/post-1/comments')
      .send({ content: 'Nice shot' })
      .expect(401);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/posts/post-1/comments')
      .set(BEARER)
      .send({ content: 'Nice shot', authorId: 'attacker' })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('creates a comment as the session profile', async () => {
    mockService.create.mockResolvedValue({
      id: 'c-1',
      content: 'Nice shot',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/posts/post-1/comments')
      .set(BEARER)
      .send({ content: 'Nice shot' })
      .expect(201);

    expect(res.body).toEqual({ id: 'c-1', content: 'Nice shot' });
    expect(mockService.create).toHaveBeenCalledWith(
      'post-1',
      TEST_USER.profileId,
      { content: 'Nice shot' },
    );
  });

  it('lists comments with the viewer profile when present', async () => {
    mockService.findByPost.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/posts/post-1/comments')
      .query({ page: 1, limit: 10 })
      .set(BEARER)
      .expect(200);

    expect(mockService.findByPost).toHaveBeenCalledWith(
      'post-1',
      expect.objectContaining({ page: 1, limit: 10 }),
      TEST_USER.profileId,
    );
  });

  it('lists comments without a profile when the viewer is anonymous', async () => {
    mockService.findByPost.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/posts/post-1/comments')
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(mockService.findByPost).toHaveBeenCalledWith(
      'post-1',
      expect.objectContaining({ page: 1, limit: 10 }),
      undefined,
    );
  });

  it('deletes a comment as the session profile', async () => {
    mockService.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete('/api/v1/posts/post-1/comments/c-1')
      .set(BEARER)
      .expect(204);

    expect(mockService.remove).toHaveBeenCalledWith('c-1', TEST_USER.profileId);
  });

  it('likes and unlikes a comment as the session profile', async () => {
    mockService.likeComment.mockResolvedValue(undefined);
    mockService.unlikeComment.mockResolvedValue(undefined);

    const liked = await request(app.getHttpServer())
      .post('/api/v1/posts/post-1/comments/c-1/like')
      .set(BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/posts/post-1/comments/c-1/like')
      .set(BEARER)
      .expect(204);

    expect(liked.body).toEqual({ success: true });
    expect(mockService.likeComment).toHaveBeenCalledWith(
      'c-1',
      TEST_USER.profileId,
    );
    expect(mockService.unlikeComment).toHaveBeenCalledWith(
      'c-1',
      TEST_USER.profileId,
    );
  });
});
