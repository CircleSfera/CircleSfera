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
import { HighlightsController } from './highlights.controller.js';
import { HighlightsService } from './highlights.service.js';

describe('HighlightsController', () => {
  let app: INestApplication;

  const mockService = {
    create: vi.fn(),
    update: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [HighlightsController],
      providers: [{ provide: HighlightsService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
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
      .post('/api/v1/highlights')
      .send({ title: 'Travel', storyIds: ['story-1'] })
      .expect(401);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/highlights')
      .set(BEARER)
      .send({
        title: 'Travel',
        storyIds: ['story-1'],
        ownerId: 'attacker',
      })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('creates a highlight for the session profile', async () => {
    mockService.create.mockResolvedValue({
      id: 'hl-1',
      title: 'Travel',
      storyIds: ['story-1'],
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/highlights')
      .set(BEARER)
      .send({ title: 'Travel', storyIds: ['story-1'] })
      .expect(201);

    expect(res.body).toEqual({
      id: 'hl-1',
      title: 'Travel',
      storyIds: ['story-1'],
    });
    expect(mockService.create).toHaveBeenCalledWith(TEST_USER.profileId, {
      title: 'Travel',
      storyIds: ['story-1'],
    });
  });

  it('updates a highlight owned by the session profile', async () => {
    mockService.update.mockResolvedValue({
      id: 'hl-1',
      title: 'Updated',
    });

    await request(app.getHttpServer())
      .patch('/api/v1/highlights/hl-1')
      .set(BEARER)
      .send({ title: 'Updated' })
      .expect(200);

    expect(mockService.update).toHaveBeenCalledWith(
      'hl-1',
      TEST_USER.profileId,
      { title: 'Updated' },
    );
  });

  it('lists highlights for a public profile id', async () => {
    mockService.findAll.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/highlights/profile/profile-9')
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith('profile-9');
  });

  it('keeps the deprecated user/:profileId path on the same query', async () => {
    mockService.findAll.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/highlights/user/profile-9')
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith('profile-9');
  });

  it('loads a highlight by id without requiring a session', async () => {
    mockService.findOne.mockResolvedValue({ id: 'hl-1' });

    await request(app.getHttpServer())
      .get('/api/v1/highlights/hl-1')
      .expect(200);

    expect(mockService.findOne).toHaveBeenCalledWith('hl-1');
  });

  it('deletes a highlight owned by the session profile', async () => {
    mockService.remove.mockResolvedValue({ ok: true });

    const res = await request(app.getHttpServer())
      .delete('/api/v1/highlights/hl-1')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ ok: true });
    expect(mockService.remove).toHaveBeenCalledWith(
      'hl-1',
      TEST_USER.profileId,
    );
  });
});
