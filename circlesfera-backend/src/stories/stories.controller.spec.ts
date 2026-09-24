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
import { OwnershipGuard } from '../auth/guards/ownership.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { StoriesController } from './stories.controller.js';
import { StoriesService } from './stories.service.js';

describe('StoriesController', () => {
  let app: INestApplication;

  const mockService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findByUser: vi.fn(),
    getArchive: vi.fn(),
    delete: vi.fn(),
    view: vi.fn(),
    getViews: vi.fn(),
    addReaction: vi.fn(),
    getReactions: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [StoriesController],
      providers: [{ provide: StoriesService, useValue: mockService }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: EmailVerifiedGuard, mode: 'allow' },
        { guard: JwtOptionalGuard, mode: 'optional' },
        { guard: OwnershipGuard, mode: 'allow' },
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
      .post('/api/v1/stories')
      .send({ url: 'https://cdn.example/story.jpg' })
      .expect(401);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/stories')
      .set(BEARER)
      .send({
        url: 'https://cdn.example/story.jpg',
        authorId: 'attacker',
      })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('creates a story as the session profile', async () => {
    mockService.create.mockResolvedValue({ id: 'story-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/stories')
      .set(BEARER)
      .send({ url: 'https://cdn.example/story.jpg' })
      .expect(201);

    expect(res.body).toEqual({ id: 'story-1' });
    expect(mockService.create).toHaveBeenCalledWith(
      TEST_USER.profileId,
      expect.objectContaining({
        url: 'https://cdn.example/story.jpg',
      }),
    );
  });

  it('lists the feed with the viewer profile when present', async () => {
    mockService.findAll.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/stories')
      .set(BEARER)
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith(TEST_USER.profileId);
  });

  it('lists the feed without a profile when anonymous', async () => {
    mockService.findAll.mockResolvedValue([]);

    await request(app.getHttpServer()).get('/api/v1/stories').expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith(undefined);
  });

  it('loads another profile stories with the viewer profileId', async () => {
    mockService.findByUser.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/stories/user/alice')
      .set(BEARER)
      .expect(200);

    expect(mockService.findByUser).toHaveBeenCalledWith(
      'alice',
      TEST_USER.profileId,
    );
  });

  it('reads the archive, deletes and records a view as the session profile', async () => {
    mockService.getArchive.mockResolvedValue([]);
    mockService.delete.mockResolvedValue(undefined);
    mockService.view.mockResolvedValue({ id: 'view-1' });

    await request(app.getHttpServer())
      .get('/api/v1/stories/archive')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/stories/story-1')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/stories/story-1/view')
      .set(BEARER)
      .expect(201);

    expect(mockService.getArchive).toHaveBeenCalledWith(TEST_USER.profileId);
    expect(mockService.delete).toHaveBeenCalledWith('story-1');
    expect(mockService.view).toHaveBeenCalledWith(
      'story-1',
      TEST_USER.profileId,
    );
  });

  it('reacts as the session profile', async () => {
    mockService.addReaction.mockResolvedValue({ id: 'rx-1' });

    await request(app.getHttpServer())
      .post('/api/v1/stories/story-1/react')
      .set(BEARER)
      .send({ reaction: '❤️' })
      .expect(201);

    expect(mockService.addReaction).toHaveBeenCalledWith(
      'story-1',
      TEST_USER.profileId,
      '❤️',
    );
  });

  it('gets views and reactions for a story', async () => {
    mockService.getViews.mockResolvedValue({ data: [{ id: 'v-1' }] });
    mockService.getReactions.mockResolvedValue({ data: [{ id: 'r-1' }] });

    const viewsRes = await request(app.getHttpServer())
      .get('/api/v1/stories/story-1/views')
      .expect(200);
    expect(viewsRes.body).toEqual({ data: [{ id: 'v-1' }] });
    expect(mockService.getViews).toHaveBeenCalledWith('story-1', undefined, 10);

    const reactionsRes = await request(app.getHttpServer())
      .get('/api/v1/stories/story-1/reactions')
      .expect(200);
    expect(reactionsRes.body).toEqual({ data: [{ id: 'r-1' }] });
    expect(mockService.getReactions).toHaveBeenCalledWith(
      'story-1',
      undefined,
      10,
    );
  });

  it('forwards cursor and limit query params for story views pagination', async () => {
    mockService.getViews.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/stories/story-1/views?cursor=v-9&limit=25')
      .expect(200);

    expect(mockService.getViews).toHaveBeenCalledWith('story-1', 'v-9', 25);
  });
});
