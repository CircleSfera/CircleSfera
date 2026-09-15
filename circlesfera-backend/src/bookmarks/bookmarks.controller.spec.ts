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
import { BookmarksController } from './bookmarks.controller.js';
import { BookmarksService } from './bookmarks.service.js';

describe('BookmarksController', () => {
  let app: INestApplication;

  const mockService = {
    toggle: vi.fn(),
    updateCollection: vi.fn(),
    getBookmarks: vi.fn(),
    check: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [BookmarksController],
      providers: [{ provide: BookmarksService, useValue: mockService }],
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
      .post('/api/v1/bookmarks/post-1')
      .send({ collectionId: 'col-1' })
      .expect(401);

    expect(mockService.toggle).not.toHaveBeenCalled();
  });

  it('toggles a bookmark as the session profile', async () => {
    mockService.toggle.mockResolvedValue({ bookmarked: true });

    const res = await request(app.getHttpServer())
      .post('/api/v1/bookmarks/post-1')
      .set(BEARER)
      .send({ collectionId: 'col-1' })
      .expect(201);

    expect(res.body).toEqual({ bookmarked: true });
    expect(mockService.toggle).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'post-1',
      'col-1',
    );
  });

  it('moves a bookmark using the session profileId', async () => {
    mockService.updateCollection.mockResolvedValue({ ok: true });

    const res = await request(app.getHttpServer())
      .patch('/api/v1/bookmarks/post-1/collection')
      .set(BEARER)
      .send({ collectionId: 'col-2' })
      .expect(200);

    expect(res.body).toEqual({ ok: true });
    expect(mockService.updateCollection).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'post-1',
      'col-2',
    );
  });

  it('lists bookmarks with page, limit and collection', async () => {
    mockService.getBookmarks.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/bookmarks')
      .query({ page: 2, limit: 20, collectionId: 'col-1' })
      .set(BEARER)
      .expect(200);

    expect(mockService.getBookmarks).toHaveBeenCalledWith(
      TEST_USER.profileId,
      2,
      20,
      'col-1',
    );
  });

  it('checks a bookmark as the session profile', async () => {
    mockService.check.mockResolvedValue({ bookmarked: false });

    const res = await request(app.getHttpServer())
      .get('/api/v1/bookmarks/post-9/check')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ bookmarked: false });
    expect(mockService.check).toHaveBeenCalledWith(
      TEST_USER.profileId,
      'post-9',
    );
  });
});
