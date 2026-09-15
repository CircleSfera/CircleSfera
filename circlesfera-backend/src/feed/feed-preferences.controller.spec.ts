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
import { FeedPreferencesController } from './feed-preferences.controller.js';
import { FeedPreferencesService } from './feed-preferences.service.js';

describe('FeedPreferencesController', () => {
  let app: INestApplication;

  const mockService = {
    listPreferences: vi.fn(),
    hidePost: vi.fn(),
    unhidePost: vi.fn(),
    hideAuthor: vi.fn(),
    unhideAuthor: vi.fn(),
    muteKeyword: vi.fn(),
    unmuteKeyword: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [FeedPreferencesController],
      providers: [{ provide: FeedPreferencesService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects listing preferences without a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/feed/preferences')
      .expect(401);

    expect(mockService.listPreferences).not.toHaveBeenCalled();
  });

  it('rejects mute with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/feed/preferences/mute-keyword')
      .set(BEARER)
      .send({ keyword: 'spoiler', ownerId: 'attacker' })
      .expect(400);

    expect(mockService.muteKeyword).not.toHaveBeenCalled();
  });

  it('lists preferences as the session profile', async () => {
    mockService.listPreferences.mockResolvedValue({ hiddenPosts: [] });

    const res = await request(app.getHttpServer())
      .get('/api/v1/feed/preferences')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ hiddenPosts: [] });
    expect(mockService.listPreferences).toHaveBeenCalledWith(
      TEST_USER.profileId,
    );
  });

  it('hides and unhides a post as the session profile', async () => {
    mockService.hidePost.mockResolvedValue({ ok: true });
    mockService.unhidePost.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .post('/api/v1/feed/preferences/hide-post/post-1')
      .set(BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/feed/preferences/hide-post/post-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.hidePost).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'post-1',
    );
    expect(mockService.unhidePost).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'post-1',
    );
  });

  it('hides and unhides an author as the session profile', async () => {
    mockService.hideAuthor.mockResolvedValue({ ok: true });
    mockService.unhideAuthor.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .post('/api/v1/feed/preferences/hide-author/author-1')
      .set(BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/feed/preferences/hide-author/author-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.hideAuthor).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'author-1',
    );
    expect(mockService.unhideAuthor).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'author-1',
    );
  });

  it('mutes and unmutes a keyword as the session profile', async () => {
    mockService.muteKeyword.mockResolvedValue({ ok: true });
    mockService.unmuteKeyword.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .post('/api/v1/feed/preferences/mute-keyword')
      .set(BEARER)
      .send({ keyword: 'spoiler' })
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/feed/preferences/mute-keyword/spoiler')
      .set(BEARER)
      .expect(200);

    expect(mockService.muteKeyword).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'spoiler',
    );
    expect(mockService.unmuteKeyword).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'spoiler',
    );
  });
});
