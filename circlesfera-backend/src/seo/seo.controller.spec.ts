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
import { createControllerApp } from '../common/testing/http-controller.js';
import { SeoController } from './seo.controller.js';
import { SeoService } from './seo.service.js';

describe('SeoController', () => {
  let app: INestApplication;

  const mockService = {
    generateSitemapIndex: vi.fn(),
    generateSitemapPart: vi.fn(),
    generateRobotsTxt: vi.fn(),
    generateOpenGraphHtml: vi.fn(),
    generatePostOgImage: vi.fn(),
    generateProfileOgImage: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [SeoController],
      providers: [{ provide: SeoService, useValue: mockService }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates sitemap and robots.txt', async () => {
    mockService.generateSitemapIndex.mockResolvedValue('<sitemapindex/>');
    mockService.generateRobotsTxt.mockReturnValue('User-agent: *');

    const sitemap = await request(app.getHttpServer())
      .get('/api/v1/sitemap.xml')
      .expect(200);
    expect(sitemap.text).toBe('<sitemapindex/>');
    expect(sitemap.headers['cache-control']).toBe('public, max-age=3600');

    const robots = await request(app.getHttpServer())
      .get('/api/v1/robots.txt')
      .expect(200);
    expect(robots.text).toBe('User-agent: *');

    expect(mockService.generateSitemapIndex).toHaveBeenCalledWith();
    expect(mockService.generateRobotsTxt).toHaveBeenCalledWith();
  });

  it('serves a part of the site map, and nothing for a part that is not there', async () => {
    mockService.generateSitemapPart.mockResolvedValueOnce('<urlset/>');
    const part = await request(app.getHttpServer())
      .get('/api/v1/sitemap/profiles/2')
      .expect(200);
    expect(part.text).toBe('<urlset/>');
    expect(part.headers['content-type']).toContain('application/xml');
    expect(mockService.generateSitemapPart).toHaveBeenCalledWith('profiles', 2);

    mockService.generateSitemapPart.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get('/api/v1/sitemap/posts/99')
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/sitemap/messages/1')
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/sitemap/posts/one')
      .expect(400);
    // An unknown kind never reaches the database.
    expect(mockService.generateSitemapPart).toHaveBeenCalledTimes(2);
  });

  it('generates Open Graph HTML with a path or the root fallback', async () => {
    mockService.generateOpenGraphHtml.mockResolvedValue('<html/>');

    await request(app.getHttpServer())
      .get('/api/v1/og')
      .query({ path: '/u/alice' })
      .expect(200);
    await request(app.getHttpServer()).get('/api/v1/og').expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/og')
      .query({ path: '' })
      .expect(200);

    expect(mockService.generateOpenGraphHtml).toHaveBeenNthCalledWith(
      1,
      '/u/alice',
    );
    expect(mockService.generateOpenGraphHtml).toHaveBeenNthCalledWith(2, '/');
    expect(mockService.generateOpenGraphHtml).toHaveBeenNthCalledWith(3, '/');
  });

  it('generates OG images by post id and username', async () => {
    mockService.generatePostOgImage.mockResolvedValue('<svg/>');
    mockService.generateProfileOgImage.mockResolvedValue('<svg/>');

    await request(app.getHttpServer())
      .get('/api/v1/og-image/post/post-1')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/og-image/profile/alice')
      .expect(200);

    expect(mockService.generatePostOgImage).toHaveBeenCalledWith('post-1');
    expect(mockService.generateProfileOgImage).toHaveBeenCalledWith('alice');
  });
});
