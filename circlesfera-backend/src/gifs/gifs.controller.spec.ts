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
import { PrismaService } from '../prisma/prisma.service.js';
import { GifsController } from './gifs.controller.js';
import { GiphyService } from './giphy.service.js';

describe('GifsController', () => {
  let app: INestApplication;
  const giphy = {
    available: vi.fn(),
    search: vi.fn(),
    trending: vi.fn(),
  };
  const prisma = { profile: { findUnique: vi.fn() } };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [GifsController],
      providers: [
        { provide: GiphyService, useValue: giphy },
        { provide: PrismaService, useValue: prisma },
      ],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    giphy.available.mockReturnValue(true);
    giphy.search.mockResolvedValue([]);
    giphy.trending.mockResolvedValue([]);
    prisma.profile.findUnique.mockResolvedValue({ user: { locale: 'en' } });
  });

  it.each([
    '/api/v1/gifs',
    '/api/v1/gifs/trending',
    '/api/v1/gifs/search?q=cats',
  ])('rejects %s without a session', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
    expect(giphy.search).not.toHaveBeenCalled();
    expect(giphy.trending).not.toHaveBeenCalled();
  });

  it('says whether GIFs are offered', async () => {
    giphy.available.mockReturnValue(false);
    const res = await request(app.getHttpServer())
      .get('/api/v1/gifs')
      .set(BEARER)
      .expect(200);
    expect(res.body).toEqual({ available: false });
  });

  it("searches in the language of the person's account, from the offset asked", async () => {
    await request(app.getHttpServer())
      .get('/api/v1/gifs/search?q=cats&offset=24')
      .set(BEARER)
      .expect(200);

    expect(prisma.profile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TEST_USER.profileId } }),
    );
    expect(giphy.search).toHaveBeenCalledWith('cats', 24, 'en');
  });

  it('lists trending GIFs from the start by default', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/gifs/trending')
      .set(BEARER)
      .expect(200);
    expect(giphy.trending).toHaveBeenCalledWith(0);
  });

  it.each([
    '/api/v1/gifs/search',
    `/api/v1/gifs/search?q=${'a'.repeat(51)}`,
    '/api/v1/gifs/search?q=cats&offset=-1',
    '/api/v1/gifs/search?q=cats&offset=9999',
  ])('refuses a search out of bounds: %s', async (path) => {
    await request(app.getHttpServer()).get(path).set(BEARER).expect(400);
    expect(giphy.search).not.toHaveBeenCalled();
  });

  it('answers that GIFs are not offered when the server has no key', async () => {
    giphy.available.mockReturnValue(false);

    const search = await request(app.getHttpServer())
      .get('/api/v1/gifs/search?q=cats')
      .set(BEARER)
      .expect(404);
    expect(search.body.errorCode).toBe('GIFS_UNAVAILABLE');
    await request(app.getHttpServer())
      .get('/api/v1/gifs/trending')
      .set(BEARER)
      .expect(404);
    expect(giphy.search).not.toHaveBeenCalled();
    expect(giphy.trending).not.toHaveBeenCalled();
  });
});
