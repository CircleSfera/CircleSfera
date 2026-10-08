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

  it('passes the verified-only filter on when the search asks for it', async () => {
    mockService.search.mockResolvedValue({ users: [], hashtags: [] });

    await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'ada', verified: 'true' })
      .set(BEARER)
      .expect(200);

    expect(mockService.search).toHaveBeenCalledWith(
      'ada',
      TEST_USER.profileId,
      true,
    );
  });

  it('searches as the session profileId', async () => {
    mockService.search.mockResolvedValue({ users: [], hashtags: [] });

    const res = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'ada' })
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual({ users: [], hashtags: [] });
    expect(mockService.search).toHaveBeenCalledWith(
      'ada',
      TEST_USER.profileId,
      false,
    );
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

    expect(mockService.getTrending).toHaveBeenCalledWith(
      5,
      TEST_USER.profileId,
    );
    expect(mockService.getHistory).toHaveBeenCalledWith(TEST_USER.profileId);
    expect(mockService.clearHistory).toHaveBeenCalledWith(TEST_USER.profileId);
  });

  it('searches posts, semantic AI, semantic profiles, and users', async () => {
    mockService.searchPosts.mockResolvedValue([{ id: 'p-1' }]);
    mockService.semanticSearchPosts.mockResolvedValue([{ id: 'p-ai' }]);
    mockService.semanticSearchProfiles.mockResolvedValue([{ id: 'prof-ai' }]);
    mockService.searchUsers.mockResolvedValue([{ id: 'u-1' }]);
    mockService.getTrending.mockResolvedValue([]);

    // Default trending limit test
    await request(app.getHttpServer())
      .get('/api/v1/search/trending')
      .set(BEARER)
      .expect(200);
    expect(mockService.getTrending).toHaveBeenCalledWith(
      10,
      TEST_USER.profileId,
    );

    // searchPosts
    const postsRes = await request(app.getHttpServer())
      .get('/api/v1/search/posts')
      .query({ q: 'photography' })
      .set(BEARER)
      .expect(200);
    expect(postsRes.body).toEqual([{ id: 'p-1' }]);
    expect(mockService.searchPosts).toHaveBeenCalledWith(
      'photography',
      TEST_USER.profileId,
    );

    // semanticSearchPosts
    const aiRes = await request(app.getHttpServer())
      .get('/api/v1/search/ai')
      .query({ q: 'sunset beach' })
      .set(BEARER)
      .expect(200);
    expect(aiRes.body).toEqual([{ id: 'p-ai' }]);
    expect(mockService.semanticSearchPosts).toHaveBeenCalledWith(
      'sunset beach',
      10,
      TEST_USER.profileId,
    );

    // semanticSearchProfiles
    const aiProfRes = await request(app.getHttpServer())
      .get('/api/v1/search/ai/profiles')
      .query({ q: 'developer' })
      .set(BEARER)
      .expect(200);
    expect(aiProfRes.body).toEqual([{ id: 'prof-ai' }]);
    expect(mockService.semanticSearchProfiles).toHaveBeenCalledWith(
      'developer',
      10,
      TEST_USER.profileId,
    );

    // searchUsers
    const usersRes = await request(app.getHttpServer())
      .get('/api/v1/search/users')
      .query({ q: 'bob' })
      .set(BEARER)
      .expect(200);
    expect(usersRes.body).toEqual([{ id: 'u-1' }]);
    expect(mockService.searchUsers).toHaveBeenCalledWith(
      'bob',
      TEST_USER.profileId,
      false,
    );
  });
});
