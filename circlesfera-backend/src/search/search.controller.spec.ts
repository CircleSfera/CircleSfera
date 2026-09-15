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
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

describe('SearchController', () => {
  let app: INestApplication;

  const mockService = {
    search: vi.fn(),
    getTrending: vi.fn(),
    searchPosts: vi.fn(),
    semanticSearchPosts: vi.fn(),
    semanticSearchProfiles: vi.fn(),
    searchUsers: vi.fn(),
    getHistory: vi.fn(),
    clearHistory: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects search without a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'ada' })
      .expect(401);

    expect(mockService.search).not.toHaveBeenCalled();
  });

  it('searches as the session profileId', async () => {
    mockService.search.mockResolvedValue({ users: [], hashtags: [] });

    const res = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'ada' })
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ users: [], hashtags: [] });
    expect(mockService.search).toHaveBeenCalledWith('ada', TEST_USER.profileId);
  });

  it('loads trending, history and clears history as the session profile', async () => {
    mockService.getTrending.mockResolvedValue([]);
    mockService.getHistory.mockResolvedValue([]);
    mockService.clearHistory.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .get('/api/v1/search/trending')
      .query({ limit: 5 })
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/search/history')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/search/history')
      .set(BEARER)
      .expect(200);

    expect(mockService.getTrending).toHaveBeenCalledWith(5);
    expect(mockService.getHistory).toHaveBeenCalledWith(TEST_USER.profileId);
    expect(mockService.clearHistory).toHaveBeenCalledWith(TEST_USER.profileId);
  });
});
